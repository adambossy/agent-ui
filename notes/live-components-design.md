# Live components — design proposal

## Problem

A third party should be able to ship a JSON-backed interactive component
(todo list, spreadsheet, kanban, calendar) and plug it into the chat UI
with one registration call. Both the LLM (via tool calls) and the user
(via clicks in the rendered component) must mutate the same document, and
subsequent LLM turns must see the up-to-date state. The chat core must
not import anything from any specific extension.

The closest precedent is the subagent system:
`app/src/state/subagentStore.ts` reduces a `data-subagent-event` channel
keyed by `parentToolCallId`, and `app/src/components/tools/SubagentTool.tsx`
renders from that store. This design follows the same shape — one
envelope, one reducer, one renderer wired through the existing tool
registry (`app/src/tools/registry.tsx`) — and adds the missing piece: a
client→server dispatch path so user clicks can issue ops.

## The shape

```
   LLM ──tool() call──┐                       ┌─> data-live-op ─> reducer
                      ↓                       │
                  agent server ─┬─ broadcast ─┤
                      ↑         │             └─> tool-output-available
   user click ─POST───┘         └─ persist (docId, schemaVersion, payload)
        │
        └──optimistic patch──> reducer ──> renderer
```

One wire envelope (`data-live-op`) carries ops in both directions of the
SSE stream. User-originated ops POST to a single endpoint; the server
applies, persists, and broadcasts back over the same SSE channel. In
mock mode the Vite middleware in `app/src/mock/vite-plugin.ts` calls the
extension's mock handler; in real mode `agent_harness` does.

## Components

- **`LiveComponentRegistry`** — single map from `kind` to manifest. The
  chat core touches only this; it never imports a specific extension.
- **`LiveComponentManifest<S, Op>`** — what a third party hands in.
- **`liveDocStore`** — one global Zustand store keyed by `(kind, docId)`.
  Mirrors `subagentStore`'s `byParentToolCallId` indexing pattern.
- **`LiveComponentHost`** — generic tool renderer registered for every
  kind; resolves manifest, subscribes to the doc, provides `dispatch`.
- **`LiveOpClient`** — POSTs user ops and applies optimistic updates.

## How they connect

The LLM calls an extension-defined tool (e.g. `todo.addItem`). The tool's
`execute` returns ops; the server applies, persists, and emits
`data-live-op` records on the SSE stream `useChat` is already reading.
`onData` demuxes the channel into `liveDocStore`. The subscribed renderer
rerenders. When the user clicks "toggle", the renderer calls
`dispatch({ kind: "toggle-item", id })` — `LiveOpClient` applies it
optimistically with a `pendingOpId`, POSTs, and the server's broadcast
confirms or rejects. The next LLM turn sees the latest doc because there
is one source of truth (the server's persisted doc) reached by one
pipeline.

## 1. Extension manifest

```ts
export type LiveComponentManifest<S, Op> = {
  kind: string;                            // "todo-list"
  schemaVersions: number[];                // [1]; [1, 2] after migration
  initialState: (seed?: unknown) => { schemaVersion: number; payload: S };
  migrate?: (d: { schemaVersion: number; payload: unknown }) => { schemaVersion: number; payload: S };
  reducer: (state: S, op: Op) => S;        // pure
  opCodec: OpCodec<Op>;                    // see §2
  tools: Record<string, LiveTool<Op>>;     // see §7
  renderer: ComponentType<{ doc: S; dispatch: (op: Op) => void; meta: LiveDocMeta }>;
  mockServerReducer?: (state: S, op: Op) => S;   // dev backend only
};

registerLiveComponent(manifest);
```

Worked example — `todo-list@1`:

```ts
type TodoItem = { id: string; text: string; done: boolean };
type Todo = { items: TodoItem[] };
type TodoOp =
  | { kind: "add-item"; id: string; text: string }
  | { kind: "toggle-item"; id: string }
  | { kind: "edit-item"; id: string; text: string }
  | { kind: "remove-item"; id: string };

registerLiveComponent<Todo, TodoOp>({
  kind: "todo-list",
  schemaVersions: [1],
  initialState: () => ({ schemaVersion: 1, payload: { items: [] } }),
  reducer,                          // pure switch on op.kind
  opCodec: zodCodec(TodoOpSchema),
  tools: {
    "todo.addItem":    tool({ inputSchema: AddItemInput,    execute: (i) => ({ ops: [{ kind: "add-item", ...i }] }) }),
    "todo.toggleItem": tool({ inputSchema: ToggleInput,     execute: (i) => ({ ops: [{ kind: "toggle-item", id: i.id }] }) }),
    "todo.editItem":   tool({ inputSchema: EditItemInput,   execute: (i) => ({ ops: [{ kind: "edit-item", ...i }] }) }),
    "todo.removeItem": tool({ inputSchema: RemoveItemInput, execute: (i) => ({ ops: [{ kind: "remove-item", id: i.id }] }) }),
  },
  renderer: TodoListView,
  mockServerReducer: reducer,
});
```

That single call wires schema, ops, tools, and renderer. Removing it
removes the extension; nothing in the chat core references "todo".

## 2. Op contract

The op union is the extension's source of truth — a discriminated union
with a `kind` discriminator. The `opCodec` (Zod by default; the registry
accepts any `parse`/`safeParse`) validates ops at three boundaries: tool
`execute` output, inbound SSE records, and the POST endpoint. Tools are
1-to-1 with ops in the simple case but may be coarser (`import CSV` → a
batch of `add-item` ops). The contract is that `execute` returns
`{ ops: Op[] }`, not new state. The only writer to the doc is the
reducer, fed by the wire — keeping tools side-effect-free in the client.

Type flow: `LiveComponentManifest<S, Op>` parameterises `dispatch`, the
reducer, and the tool execute return. The wire envelope erases `Op` to
`unknown` and is re-parsed by `opCodec` at the boundary, so the chat
core handles only `unknown`.

## 3. Document lifetime and identity

DocIds are independent of `toolCallId`. A tool call may target an
existing doc or create one; `docId` is allocated by whichever party
creates the doc (LLM tool or user), as a UUID, and threaded through
every op. A single chat can contain many docs of the same kind (three
todo lists side by side). This diverges from the subagent model where
`parentToolCallId` is the key, because here docs outlive the tool call
that created them — a user can keep editing yesterday's todo list.
Every tool's input schema includes `docId`.

## 4. Wire format

One new data channel, comparable to `data-subagent-event`:

```ts
type LiveOpEvent =
  | { kind: "doc-init"; docId: string; componentKind: string; schemaVersion: number; payload: unknown }
  | { kind: "op-applied"; docId: string; opId: string; op: unknown; serverSeq: number; origin: "llm" | "user" }
  | { kind: "op-rejected"; docId: string; opId: string; reason: string }
  | { kind: "doc-snapshot"; docId: string; schemaVersion: number; payload: unknown; serverSeq: number };

// data: {"type":"data-live-op","data":LiveOpEvent,"transient":false}
```

`doc-init` opens a doc on a stream; `op-applied` carries confirmed ops
in `serverSeq` order; `op-rejected` rolls back optimistic user ops;
`doc-snapshot` is the catch-up record sent on resume or sequence skip.
The v1 marker (`x-vercel-ai-ui-message-stream: v1`) and SSE plumbing
are unchanged.

## 5. State store + reducer

One global store keyed by `(componentKind, docId)`, not one per
extension. The chat core resolves a renderer by kind, looks up the
manifest, and passes `manifest.reducer` to a generic apply function.
The store stays uniform; extensions don't ship state infrastructure.
Selector hooks shrink re-renders:

```ts
const doc = useLiveDoc<Todo>(kind, docId);
const itemCount = useLiveDocSelector(kind, docId, (s) => s.items.length);
```

The store adds three things on top of `payload`: `pendingOps`
(optimistic user ops awaiting confirmation), `serverSeq` (highest
applied), and `status` (`hydrating` | `ready` | `desynced`).

## 6. Outbound dispatch path

User click → `dispatch(op)` → `LiveOpClient.send`:

1. `opId = crypto.randomUUID()`.
2. Optimistically apply via `manifest.reducer`, tag with `pendingOpId`.
3. `POST /api/live/:componentKind/:docId/op` with
   `{ opId, op, baseSeq, sessionId }`.
4. Server validates, applies, persists with an OCC check on `baseSeq`,
   broadcasts `op-applied` (or `op-rejected`) to every subscribed SSE
   stream for that doc.
5. The store sees `op-applied` with matching `opId` → drops the pending
   entry, advances `serverSeq`. On `op-rejected` → rolls back and
   surfaces `reason` to the renderer.

The chat session sees the same `data-live-op` records the stream is
already carrying — the agent doesn't need a separate mechanism to learn
the user toggled an item, because the next time the LLM reads context,
the persisted doc reflects all confirmed ops.

## 7. Tool execution semantics

The tool's `execute` does **not** mutate the doc directly. It returns
`{ ops: Op[] }`. The agent server applies those ops through the same
pipeline as user ops, persists, and broadcasts `op-applied`. This is
the load-bearing decision of the design. If tools mutated the doc
themselves we'd have two writers (a local reducer and the wire reducer),
two persistence paths, and two places to enforce validation — a textbook
dual-source-of-truth bug. Routing LLM ops through the same path means
conflict handling, persistence, and broadcast have a single
implementation, and the LLM sees its own writes reflected back exactly
the way the user does.

## 8. Where the renderer lives

Inline in the message — same place as `SubagentTool` today. The host
renderer is registered via `registerToolRenderer` for every kind, and
the `tool-${kind}` part rendered by `Message.tsx` (lines 69–73) carries
the `docId`. The document is causally tied to the conversation that
produced it; pulling it into a side region breaks the "scroll up to see
what we built" affordance. Renderers wanting side-region placement can
render a thumbnail inline and open a modal themselves — a per-extension
UX choice, not a chat-level setting. Persistence outlives the message,
so re-opening the chat re-hydrates via `doc-init` on stream resume.

## 9. Cross-cutting concerns

**Conflict handling.** Optimistic concurrency via `baseSeq`. If the LLM
writes between `dispatch` and POST, the server detects stale `baseSeq`;
the user's op is either replayed by the server-side reducer when it's
commutative-by-key (ops on different items) or rejected. The reducer
declares this with a per-op `conflictPolicy` (`commute-by-id` |
`reject-on-conflict` | `lww`), defaulting to `reject-on-conflict`.

**Schema versioning.** Manifests advertise `schemaVersions: number[]`.
On `doc-init` with an unsupported version, the host renders a
"unsupported version" fallback instead of exploding. Migration is opt-in
via `manifest.migrate`. Two manifest versions can coexist by registering
distinct kinds (`todo-list@1`, `todo-list@2`); the server picks based
on the persisted doc.

**Auth scoping.** A doc is bound to a session by default — same trust
boundary as the chat. Extensions opt into account-scoped docs by setting
`manifest.scope: "account"`, in which case the server enforces ACLs on
POST and SSE subscribe.

**Multi-tab consistency.** Two tabs of the same chat both subscribe to
the same SSE stream (`notes/resumable-streams.md`). Each tab applies the
same `op-applied` records in the same order. Pending-op layer is
per-tab; a tab only sees the final state when its own pending op is
confirmed.

## 10. What this design DOESN'T do

- **CRDTs.** LWW + reject-on-conflict for MVP. The envelope carries
  `baseSeq` and `opId`, which is what a CRDT layer would need; swapping
  in Yjs later means replacing the reducer-and-server pair without
  touching the wire envelope or renderer contract.
- **Undo/redo as a first-class feature.** The op log is the substrate
  but the registry doesn't expose undo. Extensions can build their own.
- **Cross-extension composition.** A todo renderer cannot embed a
  spreadsheet inside a cell. The host has one manifest per kind; nested
  live components would need a separate composition primitive.
- **Real-time multi-user collab.** Two users editing the same doc
  concurrently is not supported. Auth scope is "all subscribers trust
  each other"; the server doesn't merge concurrent users' writes.

Forward seams: the wire envelope already supports sequencing; the
reducer is already pure; the manifest is one registration point.
Extending later means filling in code, not redrawing boundaries.

## 11. Self-critique

**Where this hurts most.** The "tools emit ops, server applies through
the same pipeline as user ops" rule is elegant but adds a round-trip
to every LLM mutation: the tool call goes to the server, the server
reduces and broadcasts, and only then does the client see the new state.
For chatty extensions (a 200-cell spreadsheet filled one cell at a
time) this can dominate latency. The mitigation — batching ops in a
single tool call — pushes complexity onto extension authors, and a
sloppy author ends up with 200 separate `op-applied` events on the
wire. The deeper failure mode is that some extensions genuinely want
client-side authoritative LLM writes ("render the model's op instantly,
before the server confirms") and our single-source-of-truth discipline
forbids it. Adding an `optimisticLlm: true` escape hatch on the
manifest would let two writers back in.

**Awkward extensions and leaked coupling.** A spreadsheet with formulas
is awkward: ops on cell A depend on cell B, so the pure reducer must
recompute dependents — fine small, expensive large. A calendar with
timezones is awkward because ops carry wall time but the renderer
needs viewer TZ. A drawing canvas is awkward because strokes aren't
discrete ops in any natural way. The worst plausible cross-extension
leak is the doc store becoming a dumping ground: an extension parks
50MB of canvas state in `payload`, the chat core happily serializes
it on every `doc-snapshot`, and the chat is slow for everyone. The
choke point is `doc-snapshot`'s payload size. A defensible answer is a
size budget plus a documented "store large blobs out-of-band, reference
by URL" convention — but it's a convention the registry can't enforce,
only document.
