# Agent UI Deep Comparison: Pi · Toad · OpenCode · OpenClaw

## 1. Streaming & Rendering Architecture

All four systems stream structured events, but they diverge sharply on **where the rendering model lives** and **what the unit of mutation is**.

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Transport | In-process events | JSON-RPC stdio | SSE (`/event`) | WebSocket |
| Unit of stream | Event (`text_delta`, `toolcall_delta`) | ACP `session/update` notification | Typed part update | Named stream (`assistant`, `tool`, `lifecycle`) |
| Rendering split | Stable history + separate `StreamingMessageContainer` | Finalized blocks + mutable last block | Server-persisted parts, client subscribes | Non-blocking send ack → WS event stream |
| Reconnect story | N/A (in-process) | Session reload replays updates | Client refetches; SSE reconnects | Events NOT replayed; client must refresh history |

### Notable findings

**Pi's `StreamingMessageContainer` is the most explicit rendering optimization found.** It deep-clones the in-flight message before passing to Lit (so the framework detects mutations in nested objects like streaming tool args), and batches updates with `requestAnimationFrame`. No other system documents this level of render-path detail.

**Toad's "only the last block is mutable" rule** is the most elegant streaming Markdown strategy. Rather than re-rendering the entire document on each token, it finalizes earlier blocks and only reparses from the start of the last block. Parse time stays sub-1ms regardless of document length. It also coalesces tokens that arrive faster than paint cycles into a buffer — the UI never "replays" stale intermediate states.

**OpenCode is the only system that persists streaming state server-side.** Every part update is written to authoritative server state before being broadcast. This means the TUI, SDK, web client, and desktop app all see identical state — and reconnecting clients get the full picture from the server, not from replaying an event log. The tradeoff is write amplification on every token.

**OpenClaw's "events are not replayed" policy** is the most opinionated reconnect story. If a client disconnects mid-stream, it must fetch `chat.history` to reconcile. This keeps the server simple but pushes complexity to the client. Combined with idempotency keys on all side-effecting methods, it creates a clean command/event split.

---

## 2. Message & Content Model

The core question: **what is a message made of?**

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Message structure | Ordered content blocks: `text`, `thinking`, `toolCall` | ACP update stream (no formal message-part model in protocol) | Message → typed Parts (`text`, `thinking`, `tool`, `step-start`, `subtask`) | Streams: `assistant`, `tool`, `lifecycle` (less formally typed) |
| Tool result storage | Separate `toolResult` message, joined by `toolCallId` | Tool updates via `tool_call_update`, paired by `toolCallId` | Tool as a Part within the message, with lifecycle fields | `toolStreamById` map, tool cards in chat |
| Thinking | First-class `ThinkingBlock` content type | ACP `thought` chunk type | Separate part type, togglable with `/thinking` | Present but less emphasized in browser UI docs |
| Interleaving preserved? | Yes — prose → thinking → tool call order maintained | Yes — update order preserved | Yes — parts ordered within message | Streams are separate channels; interleaving is a client concern |

### Notable findings

**Pi is the only system that explicitly models tool calls as assistant content blocks interleaved with text and thinking.** The assistant message is an ordered array of `[text, thinking, toolCall, text, ...]`. This means the UI can faithfully reproduce the agent's reasoning flow: "I'll search for X" → [thinking] → [tool: search] → "Based on the results...". Other systems separate these into parallel streams or distinct parts, which means the client must reconstruct interleaving.

**OpenCode's Part model is the most normalized.** Each part has an independent type, status, and update lifecycle. This makes it trivial to show a tool spinning while text continues streaming, or to collapse all thinking parts without touching tool parts. But it loses the natural interleaving that Pi preserves.

**OpenClaw separates concerns into named streams (`assistant`, `tool`, `lifecycle`)** rather than a single ordered event log. This is architecturally clean for routing — you can subscribe to just tools, or just assistant text — but it means the client must merge and order events from multiple streams for display. This is the most "microservice-like" approach.

**Toad inherits ACP's flat update model**, which is the thinnest abstraction. ACP doesn't define a formal "message contains parts" structure — it's just a stream of typed notifications. The client builds its own internal model. This gives maximum flexibility but means each ACP client reinvents message structure.

---

## 3. Tool Call Display & Lifecycle

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Args streaming | Yes — `toolcall_delta` updates args incrementally | Yes — ACP `tool_call_update` | Not emphasized; tool created with args | Not documented |
| Output streaming | Yes — `tool_execution_update` for bash etc. | Yes — via `tool_call_update` content | Yes — stdout/stderr streams into part metadata | Yes — `tool` stream events |
| Status model | Implicit (streaming → done) | `pending → in_progress → completed → failed → cancelled` | `running → completed → error` | `started → updating → completed → error` |
| Default display | Inline card, collapsible | Structured block with icon/kind/title/status | Summary row, expand with `/details` | Card in chat, expandable sidebar |
| Custom renderers | Registry: bash, JS REPL, artifacts, fallback JSON | Kind-based: diff, terminal, text, permission | Generic tool part renderer | `toolStreamById` map + detail handlers |
| Permission model | Not documented | ACP `session/request_permission` — first-class | Not documented | Not documented |

### Notable findings

**Pi is the only system that streams tool arguments.** When the model is generating a long tool call (e.g., writing a file with 200 lines), the user sees args building up token by token. This matters for long file writes and diffs — the user gets feedback before the tool even executes. The TUI creates a `ToolExecutionComponent` immediately on first `toolcall_delta` and calls `updateArgs()` on subsequent deltas.

**Toad/ACP is the only system with a formal permission model.** `session/request_permission` lets the agent pause and ask the user before executing a tool. The client must respond before the agent continues. This is absent from Pi, OpenCode, and OpenClaw at the protocol level (though they may have application-level equivalents).

**Toad has the richest tool status model** (5 states including `pending` and `cancelled`), which matters for cancellation UX — a tool can be visually "cancelled" without being "failed" or "completed".

**Pi's tool renderer registry with fallback** is the most practical pattern for extensibility. Built-in renderers handle bash, JS REPL, and artifacts with appropriate formatting; unknown tools get a default JSON renderer. This avoids the "blank card" problem when new tools are added.

**OpenCode's "summary-first, details-on-demand"** is the most opinionated display philosophy. Tools show as a single collapsed row by default (icon + name + spinner), expandable only on demand. This keeps the conversation readable when the agent makes dozens of tool calls. The others show more detail by default.

---

## 4. Queueing & User Input During Generation

This is the area of greatest divergence. The spectrum runs from "block all input" to "five queue modes with overflow controls."

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Input during generation | TUI: Yes (steer/follow-up). Browser: **blocked** | No — ACP enforces one prompt per turn | Queued via callbacks | Yes — multiple queue modes |
| Queue semantics | **Two types**: steer + follow-up | None — serial turns only | Single FIFO callback queue | **Five modes**: collect, followup, steer, steer-backlog, interrupt |
| Interruption point | After current tool (sequential) or next turn (parallel) | N/A — cancel is separate from queue | Next loop iteration | After each tool call |
| Overflow handling | `one-at-a-time` or `all` delivery modes | N/A | Not documented | `debounceMs`, `cap`, `drop: old\|new\|summarize` |

### Notable findings

**Pi and OpenClaw independently invented the same core abstraction: steer vs. follow-up.** Both systems distinguish between "change what you're doing right now" (steer) and "do this next when you're done" (follow-up). This is not an obvious design — most systems treat queued messages as generic follow-ups. The shared insight is that users have two distinct intents when typing during generation, and conflating them produces bad UX.

**OpenClaw extends this further with 5 queue modes.** Beyond steer and followup, it adds `collect` (coalesce multiple queued messages into one turn), `steer-backlog` (steer now but also preserve the message for the next follow-up turn), and `interrupt` (abort the current run entirely). Plus overflow controls (`debounceMs`, `cap`, `drop` policies). This is by far the most sophisticated queueing system found.

**Pi's browser UI simply blocks sends during streaming.** This is explicitly called out as a gap — the TUI has rich steer/follow-up semantics with visible queue and keyboard shortcuts (`Enter` = steer, `Alt+Enter` = follow-up), but the web component drops messages on the floor. This is the most important lesson for web UI design: the queueing model must be ported to the browser, not just built for the terminal.

**Toad/ACP has no queueing at all.** ACP enforces strict turn-taking: one `session/prompt`, wait for completion, then send the next. Users who want to redirect the agent must cancel first, then send a new prompt. This is the simplest model and avoids all interleaving bugs, but it means the user can never "type ahead" or steer mid-run.

**Both Pi and OpenClaw check the queue at tool boundaries, not mid-token.** This is a critical safety decision. Interrupting mid-token-generation could produce corrupt output. Interrupting between tool calls lets the model see the steering message before its next action. Skipped tools get synthetic error results so the model knows they didn't execute.

---

## 5. Cancellation

All four systems support cancellation, but they differ on propagation depth and partial-output policy.

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Mechanism | `AbortController.abort()` | ACP `session/cancel` RPC | `AbortController` + `POST /session/:id/abort` | `chat.abort({ sessionKey })` |
| Scope | Agent-level | Session-level | Session-level | Session/run-level |
| Propagation | LLM stream + tool execution + process tree | Agent aborts LLM + tools; late updates allowed | Model stream + tool contexts + shell commands | AbortSignal + agent timeout + disconnect timeout |
| Partial output | Preserved with `stopReason: "aborted"` | Agent may send final updates before `cancelled` stop reason | Output updated with "user-aborted" note | Partial text persisted with abort metadata |
| Late events | Not documented | Explicitly allowed before final response | Not documented | Timeout semantics: `agent.wait` timeout ≠ agent stop |

### Notable findings

**Toad/ACP is the only system that explicitly allows late events after cancellation.** After `session/cancel`, the agent can still send updates as long as it hasn't sent the final `session/prompt` response. The client must accept these. This is important because real-world tools (subprocesses, API calls) don't stop instantly — the UI needs to handle the draining period gracefully rather than ignoring post-cancel events.

**All four systems preserve partial output on cancel.** None of them discard what was generated. This is a unanimous design decision: cancellation means "stop generating more," not "undo what you generated."

**OpenClaw has the most cancellation triggers** — programmatic AbortSignal, agent timeout, and disconnect/RPC timeout. The subtle point is that `agent.wait` timeout only times out the waiter (e.g., a channel waiting for a response), not the agent itself. This distinction matters for multi-client architectures where one client disconnecting shouldn't kill the agent run.

---

## 6. Sub-agent & Parallel Execution

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Built-in subagents | No | No | Yes (`general`, `explore`) | Yes (`sessions_spawn`) |
| Subagent model | Extension: tool call spawning `pi` subprocesses | Multiple independent sessions | Child sessions (`/session/:id/children`) | Isolated child session with `childSessionKey` |
| Parallelism | Extension: max 8 tasks, 4 concurrent | Multiple sessions run concurrently | `general` subagent runs work in parallel | Dedicated `subagent` queue lane (default concurrency: 8) |
| UI for subagents | Subagent output = tool call output | Session list (`ctrl+s`) | Navigate into child sessions, cycle between them | Session listings + announce-back results |
| Nesting depth | Configurable in extension | N/A | Not documented | One level — subagents cannot spawn sub-subagents |

### Notable findings

**OpenCode and OpenClaw both model subagents as child sessions, but with different navigation models.** OpenCode lets the user enter a child session and navigate within it as a full conversation. OpenClaw treats child sessions as fire-and-forget — results are "announced back" to the parent. This reflects their different audiences: OpenCode is for a single developer who wants to inspect subagent work; OpenClaw is for a multi-channel system where subagent results flow back as messages.

**Pi's approach is the most compositional.** Subagents are just tool calls that happen to spawn processes. The parent sees tool execution updates; the child runs independently. There's no special UI — it reuses the tool card. This means subagents get all existing tool UX (streaming output, collapsible details, cancellation) for free, but there's no way to "drill into" a subagent's conversation.

**OpenClaw explicitly limits nesting to one level.** Sub-agents cannot spawn sub-sub-agents and don't get session tools by default. This is a deliberate complexity cap — unbounded nesting creates both runtime and UX problems.

**No system has a rich DAG/tree visualization for parallel subagent work.** All four represent subagents as either tool calls or separate sessions. None renders a visual graph of cooperating agents, dependency edges, or parallel execution lanes. This is the most obvious gap across all systems.

---

## 7. State Authority & Persistence

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Source of truth | In-process agent state (TUI); IndexedDB (browser) | Agent subprocess | **Server** (persisted Session → Message → Part) | **Gateway** (JSONL transcripts on disk) |
| Client model | Direct state access (TUI); self-contained SPA (browser) | ACP client building state from notifications | Thin subscriber to SSE events | Thin subscriber to WS events |
| Multi-client | Not supported | Not supported | Yes — server serves TUI, SDK, web, desktop | Yes — Gateway serves Control UI, channels, API |
| Persistence format | JSONL tree files (TUI); IndexedDB (browser) | Agent-side (ACP `session/load` replays) | Server-persisted normalized state | JSONL transcripts on disk |
| Frontend store | None (Lit `@state` fields) | Textual widgets | Derived from server events | Lit `@state` fields + Maps/Sets |

### Notable findings

**OpenCode and OpenClaw are server-authoritative; Pi and Toad are not.** This is the most consequential architectural split. Server authority means:
- Multiple clients see identical state
- Reconnecting clients get full state from the server
- The UI can be swapped without losing anything
- But: every update has write amplification and network latency

**Pi's browser UI uses IndexedDB as its own source of truth.** This is a fundamentally different model from OpenCode/OpenClaw — the browser is self-contained, not a thin client. It works well for single-user local use but makes multi-device and reconnection harder.

**Neither Pi nor OpenClaw use an external frontend state store.** Both use Lit with `@state` reactive fields and local Maps/Sets. OpenCode's TUI subscribes to server events. Toad uses Textual widgets. None of them use Redux, Zustand, MobX, or similar. The lesson: for agent UIs, component-local reactive state + event subscriptions is sufficient; you don't need a heavy store layer.

**Toad delegates persistence entirely to the agent.** ACP's `session/load` replays conversation via `session/update` events. The client stores nothing — the agent owns all history. This is the thinnest client model but means the client can't show anything until the agent replays.

---

## 8. Protocol & Connectivity

| | Pi | Toad | OpenCode | OpenClaw |
|---|---|---|---|---|
| Protocol | In-process TypeScript events | ACP (JSON-RPC 2.0 over stdio) | REST + SSE | WebSocket (typed JSON protocol) |
| Agent connection | Library import | Subprocess spawn | Co-located server | Gateway WebSocket |
| Standardized? | No — internal API | Yes — ACP spec | No — custom server API | No — custom WS protocol |
| Remote agents | Browser UI only | Planned (not stdio) | Yes — server can be remote | Yes — Gateway is network-first |
| Idempotency | Not documented | Not documented | Not documented | Yes — idempotency keys on mutations |

### Notable findings

**Toad/ACP is the only system using a standardized protocol**, which means agents built for ACP work with any ACP client. The tradeoff is that ACP is lowest-common-denominator — features like queueing, subagent orchestration, and thinking token display must be layered on top.

**OpenClaw is the only system with idempotency keys.** This matters for unreliable networks (mobile!) — a retried `chat.send` with the same key returns `in_flight` or `ok` instead of creating a duplicate run. None of the other systems document this.

**Pi is the only system where the "protocol" is just TypeScript function calls.** The agent core, session layer, and web UI are all JS/TS packages in one monorepo. There's no serialization boundary between agent logic and UI logic in the TUI path. This is fastest for development but means you can't swap the agent implementation without reimplementing the event contract.

---

## 9. Cross-Cutting Design Decisions

### Where they all agree
1. **Tool calls are first-class UI objects**, not hidden or blended into text
2. **One active run per session** — no system allows concurrent runs in the same conversation
3. **Cancellation preserves partial output** — none discards generated content
4. **Thinking/reasoning is a separate display channel** from assistant text
5. **No global frontend state store** — all use component-local reactive state or event subscriptions

### Where they all diverge
1. **Queueing** — from "blocked" (Toad) to 5-mode lane-aware FIFO (OpenClaw)
2. **State authority** — client-owned (Pi browser, Toad) vs. server-owned (OpenCode, OpenClaw)
3. **Subagent UI** — tool card (Pi), session list (Toad), navigable child session (OpenCode), announce-back (OpenClaw)
4. **Reconnection** — replay from agent (Toad), refetch from server (OpenCode, OpenClaw), N/A (Pi TUI)

### The steer-vs-followup insight
The most transferable finding across all research: **users typing during an active agent run have two distinct intents that should not be conflated.**

- **"Stop, do this instead"** (steer) — interrupts at the next safe boundary (tool call completion), injects the new message, and lets the model respond to the redirect
- **"When you're done, also do this"** (follow-up) — queued for after the current run completes, does not interrupt

Pi invented this with explicit TUI keybindings (`Enter` vs `Alt+Enter`). OpenClaw formalized it into configurable queue modes. Toad and OpenCode don't support it yet. Any new agent UI should support both from day one.

### The tool-boundary interruption consensus
Pi and OpenClaw independently arrived at the same interruption safety rule: **never interrupt mid-token or mid-tool; always wait for a tool boundary.** When a steering message is dequeued:
- The current tool finishes
- Remaining queued tool calls from the same assistant turn are skipped (with synthetic error results)
- The steering message is injected
- The model sees the interruption context and responds accordingly

This is safer than mid-token interruption (which can corrupt output) and more responsive than waiting for the entire turn to complete.
