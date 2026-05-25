# sst/opencode — TUI Rendering of the Agent Turn

## Headline

opencode's TUI is **not** Bubble Tea / Go anymore. The current TUI lives entirely inside `packages/opencode/src/cli/cmd/tui/` as **TypeScript + SolidJS rendered via OpenTUI** (`@opentui/core`, `@opentui/solid`, `@opentui/keymap`, `opentui-spinner`). No `tui/` Go package, no Bubble Tea, no Ink. There is also a desktop Electron app under `packages/desktop/` but the terminal experience is the OpenTUI/Solid one.

Key entry points to read in this order:
- `packages/opencode/src/cli/cmd/tui/app.tsx` — providers, routing, command palette
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` — **the** turn renderer (2344 lines; all part renderers and per-tool components are here)
- `packages/opencode/src/cli/cmd/tui/context/sdk.tsx` — SSE subscription with 16 ms batching
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx` — Solid Store reducer over bus events
- `packages/opencode/src/session/message-v2.ts` — Part / ToolState schemas + bus event defs
- `packages/opencode/src/session/processor.ts` — AI-SDK stream → Parts → bus events
- `packages/opencode/src/session/status.ts` — `idle | busy | retry` state machine
- `packages/opencode/src/cli/cmd/tui/component/spinner.tsx` — generic spinner (80 ms tick)
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx` — agent-colored prompt-bar spinner (40 ms)

## Repo layout

```
packages/opencode/src/
  session/
    message-v2.ts       Part / ToolState schemas, message.* bus events
    processor.ts        AI SDK stream-event handler -> Parts + bus
    status.ts           SessionStatus state machine
    llm.ts              Wires AI SDK streamText to processor
    session.ts          updatePart / updatePartDelta APIs
  server/               Bun HTTP server, exposes SSE event stream
  cli/cmd/tui/
    app.tsx             Root providers, routing, command palette
    routes/session/
      index.tsx         User/Assistant message + every tool renderer
      subagent-footer.tsx
      permission.tsx, question.tsx, sidebar.tsx
    component/
      spinner.tsx       Reusable braille spinner
      prompt/index.tsx  Input editor + status bar
      bg-pulse.tsx      30 fps live frame-buffer background
    context/
      sdk.tsx           SSE subscription + 16 ms batching
      sync.tsx          Solid Store of messages/parts/status
      thinking.ts       Thinking-mode preference
      theme.tsx
```

## Streaming pipeline

1. **AI SDK stream** at `session/llm.ts` feeds `StreamEvent`s.
2. **Processor** at `session/processor.ts:305` (`handleEvent`) switches on `reasoning-start|reasoning-delta|reasoning-end|tool-input-start|tool-input-end|tool-call|tool-result|tool-error|text-start|text-delta|text-end|step-start|step-finish`. Each case mutates a Part on `ctx` (`ctx.reasoningMap`, `ctx.toolcalls`, `ctx.currentText`) then calls `session.updatePart(...)` (full snapshot, publishes `MessageV2.Event.PartUpdated`) or `session.updatePartDelta(...)` (publishes `MessageV2.Event.PartDelta`). Events defined `session/message-v2.ts:517-552`.
3. **HTTP SSE** server exposes a global event stream.
4. **TUI subscribes** at `cli/cmd/tui/context/sdk.tsx:74` (`startSSE` → `sdk.global.event({sseMaxRetryAttempts: 0})`). Events are micro-batched (`sdk.tsx:46-72`): if last flush was <16 ms ago, a `setTimeout(flush, 16)` coalesces; flush wraps emissions in Solid `batch(...)`.
5. **Reducer** at `cli/cmd/tui/context/sync.tsx:240-358` switches on event type:
   - `case "message.updated"` (line 253) binary-search inserts into `store.message[sessionID]` (caps at 100, drops oldest).
   - `case "message.part.updated"` (line 306) same on `store.part[messageID]`.
   - `case "message.part.delta"` (line 327) appends `delta` onto `part[field]` in place — the streaming path.
   - `case "session.status"` (line 248) writes `store.session_status[sessionID]`.
6. **Solid renderers** — `<For each={messages()}>` (`routes/session/index.tsx:1129`) then `<For each={props.parts}>` (line 1426) with `<Dynamic component={PART_MAPPING[part.type]} ...>`. Because the store is fine-grained reactive and parts mutate in place, only the changed text node re-renders per delta — no diff.

## Message part types

All defined in `packages/opencode/src/session/message-v2.ts`:

```
TextPart        line 97   { id, type:"text", text, synthetic?, ignored?, time?, metadata? }
ReasoningPart   line 113  { id, type:"reasoning", text, metadata?, time:{start, end?} }
FilePart        line 160  { id, type:"file", mime, filename?, url, source? }
ToolPart        line 310  { id, type:"tool", callID, tool, state: ToolState, metadata? }
StepStartPart   line 222  { id, type:"step-start", snapshot? }
StepFinishPart  line 229  { id, type:"step-finish", reason, cost, tokens, snapshot? }
SnapshotPart    line 82   { id, type:"snapshot", snapshot }
PatchPart       line 89   { id, type:"patch", hash, files }
AgentPart       line 170  { id, type:"agent", name, source? }
SubtaskPart     line 193  { id, type:"subtask", prompt, description, agent, model?, command? }
CompactionPart  line 184  { id, type:"compaction", auto, overflow?, tail_start_id? }
RetryPart       line 209  { id, type:"retry", error, time }
```

Union at `message-v2.ts:352`. `ToolState` is itself a union (`message-v2.ts:248-308`): `pending | running | completed | error`.

**Inline mapping in the TUI** (`routes/session/index.tsx:1493`):
```ts
const PART_MAPPING = { text: TextPart, tool: ToolPart, reasoning: ReasoningPart }
```
Only three types render inline in the assistant message body; the others are read by sidebar/footer/transcript code.

## Reasoning rendering

`routes/session/index.tsx:1499` `ReasoningPart`:

```tsx
const isDone = createMemo(() => props.part.time.end !== undefined)
const inMinimal = createMemo(() => ctx.thinkingMode() === "hide")
<Switch>
  <Match when={!inMinimal() || expanded()}>
    <code filetype="markdown" streaming={true}
          content={(inMinimal()?"- ":"") + (isDone()?"_Thought:_ ":"_Thinking:_ ") + content()} />
  </Match>
  <Match when={isDone()}>
    <CollapsedReasoningText title={title()} duration={duration()} />
  </Match>
  <Match when={true}>
    <Spinner color={theme.textMuted}>
      {title() ? "Thinking: " + title() : "Thinking"}
    </Spinner>
  </Match>
</Switch>
```

- **Streaming**: single line spinner `Thinking` (or `Thinking: <Title>` extracted from `**Title**` summaries via `reasoningTitle()` at `context/thinking.ts`).
- **Settled, minimal (default)**: one line `+ Thought: <title> · <duration>` in `theme.warning` (`CollapsedReasoningText`, line 1564); click toggles to full markdown.
- **Settled, expanded**: full `<code filetype="markdown" streaming={true}>` block prefixed `_Thought:_ `, in `theme.textMuted` with italics-stripped subtle-syntax style.

Processor flips `time.end` on `reasoning-end` (`processor.ts:226`).

## Tool call rendering

`ToolPart` dispatch (`routes/session/index.tsx:1600`) switches on `props.part.tool` to one of `Shell`, `Glob`, `Read`, `Grep`, `WebFetch`, `WebSearch`, `Write`, `Edit`, `Task`, `ApplyPatch`, `TodoWrite`, `Question`, `Skill`, `GenericTool`.

Two reusable wrappers:

- **`InlineTool`** (line 1730): one row, `paddingLeft={3}`, glyph + text. Pending shows `~ <pending text>`. Completed shows `<icon> <complete text>` in `theme.textMuted`. Spinner can be inlined. Permissions: lookup first pending permission for the session at line 1747; if its `callID` matches, forces `theme.warning` foreground (yellow). Errors render below in `theme.error`; "denied" errors render the line with `TextAttributes.STRIKETHROUGH`.
- **`BlockTool`** (line 1822): bordered (`border={["left"]}`, `SplitBorder.customBorderChars`) panel with `theme.backgroundPanel`, hover → `theme.backgroundMenu`. Title bar may be spinner-titled (`spinner={isRunning()}`).

Icon vocabulary:

| Tool | Icon | Pending text |
| --- | --- | --- |
| Shell | `$` / spinner-titled block | "Writing command..." |
| Glob | `✱` | "Finding files..." |
| Read | `→` + spinner | "Reading file..." |
| Grep | `✱` | "Searching content..." |
| WebFetch | `%` | "Fetching from the web..." |
| WebSearch | `◈` | "Searching web..." |
| Write | `←` | "Preparing write..." |
| Edit | `←` | "Preparing edit..." |
| ApplyPatch | `%` | "Preparing patch..." |
| Task (subagent) | `│` + spinner | "Delegating..." |
| TodoWrite | `⚙` | "Updating todos..." |
| Question | `→` | "Asking questions..." |
| Skill | `→` | "Loading skill..." |
| Generic | `⚙` | "Writing command..." |

Argument display: helper `input(input, omit?)` at `routes/session/index.tsx:2328` serializes primitive fields as `[k=v, k2=v2]`; path-typed arguments go through `usePathFormatter().format(...)`.

Loading state: `state.status === "running"` swaps icon for `<Spinner>` (e.g. Read at line 1989). Shell uses block form with `spinner={isRunning()}`.

## Tool result rendering

**No separate "tool_result" part type.** The result is merged into the same `ToolPart` by transitioning `state` from `ToolStateRunning` to `ToolStateCompleted` (`output`, `title`, `metadata`, `time.end`, optional `attachments`). The handler is `processor.ts:452` `case "tool-result"`; `toolResultOutput()` (processor.ts:282) normalizes AI SDK result shapes, then `completeToolCall(...)`.

Per-tool result display:

- **Shell** (`index.tsx:1869`): when `metadata.output !== undefined`, switches to `BlockTool` titled `# <description> in <workdir>`, echoes `$ <command>`, runs output through `stripAnsi`, truncates via `collapseToolOutput(output, 10, ...)` (`util/collapse-tool-output`). Overflow shows clickable `Click to expand` / `Click to collapse` in `theme.textMuted`.
- **Edit / Write / ApplyPatch** (lines 1927, 2113, 2166): when diff is in `metadata`, renders custom `<diff>` opentui component with `view="split"` if `ctx.width > 120` else `"unified"`, plus a `Diagnostics` panel listing up to 3 severity-1 LSP errors from `metadata.diagnostics`.
- **Glob / Grep / WebSearch** stay inline but append match counts (`(3 matches)`).
- **TodoWrite** (line 2242): `BlockTool` titled `# Todos`, each `TodoItem` from `component/todo-item.tsx`.
- **Question** (line 2263): block titled `# Questions`, question text in `theme.textMuted`, answers in `theme.text`.
- **GenericTool** (line 1692): block only when `ctx.showGenericToolOutput()` toggle is on (default off); otherwise inline.

A global `Show details` toggle (`session.toggle.actions`, drives `ctx.showDetails()`) hides **completed** tool parts entirely when off (`shouldHide` at `routes/session/index.tsx:1604`) — only pending/running/errored tools remain visible, keeping the transcript prose-focused.

## Final assistant text rendering

`TextPart` (`routes/session/index.tsx:1577`):

```tsx
<box id={"text-" + props.part.id} paddingLeft={3} marginTop={1} flexShrink={0}>
  <markdown
    syntaxStyle={syntax()}
    streaming={true}
    internalBlockMode="top-level"
    content={props.part.text.trim()}
    tableOptions={{ style: "grid" }}
    conceal={ctx.conceal()}
    fg={theme.markdownText}
    bg={theme.background}
  />
</box>
```

No left border, no panel — assistant text "sits flat" against `theme.background`. Tool blocks have left borders + panel backgrounds, creating visual hierarchy.

Each assistant message ends with a footer (`index.tsx:1463-1488`):
```
▣  <Mode> · <model-name> · <duration>
```
where `▣` is colored by `local.agent.color(message.agent)`; duration only shown when `message.finish` is a terminal reason (not `"tool-calls"`/`"unknown"`); on `MessageAbortedError` the glyph turns muted and `· interrupted` is appended. The footer is only shown for the last message of a turn (`props.last` or `final()`); intermediary assistant text otherwise renders identically.

## Animations / spinners

1. **Generic `<Spinner>`** at `component/spinner.tsx:8`:
   ```ts
   export const SPINNER_FRAMES = ["⠋","⠙","⠹","⠸","⠼","⠴","⠦","⠧","⠇","⠏"]
   <spinner frames={SPINNER_FRAMES} interval={80} color={color()} />
   ```
   80 ms tick (12.5 fps). Used by `InlineTool` running state, reasoning placeholder, `BlockTool` title. Honors `animations_enabled` KV flag (renders static `⋯` when off).

2. **Agent-colored prompt-bar spinner** at `component/prompt/index.tsx:1440`:
   ```ts
   frames: createFrames({ color, style: "blocks", inactiveFactor: 0.6, minAlpha: 0.3 })
   <spinner color={spinnerDef().color} frames={spinnerDef().frames} interval={40} />
   ```
   40 ms tick (25 fps), colored per agent (plan/build distinct). Only shown when `status().type !== "idle"`. Next to it: `esc interrupt` (escalates to `esc again to interrupt` in `theme.primary` after one press).

3. **Background frame-buffer animation** at `component/bg-pulse.tsx`: `FrameBufferRenderable` with `live: true`, bumps renderer to 30 fps (`renderer.targetFps = 30`). Default renderer is 60 fps (`app.tsx:131`).

4. **Streaming markdown/code** — `<markdown streaming={true}>` and `<code streaming={true}>` re-tokenize incrementally on each in-place text mutation. Not a tick; relies on Solid fine-grained reactivity.

## Multi-turn / context

- **Server-persisted.** Sessions/messages in SQLite (`storage/db.bun.ts`). On focus, `routes/session/index.tsx:248-272` calls `sdk.client.session.get` then `sync.session.sync(sessionID)`; live updates over SSE.
- **TUI store.** `store.message[sessionID]: MessageInfo[]` (binary-search sorted), `store.part[messageID]: Part[]`. Soft cap of 100 per session in the live view — older ones get shifted off and their parts dropped (`sync.tsx:272-289`); they remain on disk.
- **Compaction.** Processor sets `ctx.needsCompaction` on overflow (`processor.ts:614`) and creates a `CompactionPart`. The TUI renders it as a centered title rule (`routes/session/index.tsx:1389`):
  ```tsx
  <box marginTop={1} border={["top"]} title=" Compaction "
       titleAlignment="center" borderColor={theme.borderActive} />
  ```
- **Display.** One `<scrollbox stickyScroll={true} stickyStart="bottom">` (`index.tsx:1110`). Keyboard jumps via `session.message.next/previous`, `session.first/last`, `session.timeline`.
- **Revert/redo.** `session()?.revert?.messageID` marks a point; everything after is hidden (`<Match when={revert()?.messageID && message.id >= revert()!.messageID}>`, line 1192), replaced by a clickable "N message reverted — `<shortcut>` or /redo to restore" pill listing changed files with `+adds`/`-dels` counts (lines 1149-1190).

## Sub-agents and parallelism

**Sub-agents exist** as child sessions. The `task` tool (`packages/opencode/src/tool/task.ts`) creates a new `Session` whose `parentID` points at the caller. Supports `background: boolean` (`task.ts:56`); for backgrounded tasks, `task_status` polls (`tool/task_status.ts`).

How the TUI surfaces them:

- **Inline `Task` renderer** at `routes/session/index.tsx:2037`: `InlineTool` icon `│` with spinner. While running, it reads `sync.data.message[metadata.sessionId]` and pulls the most recent running/completed child tool to show:
  ```
  │ General Task — Investigating regression
     ↳ Read /src/foo.ts
     └ 7 toolcalls · 12s
  ```
  Clicking calls `navigate({ type: "session", sessionID: metadata.sessionId })`.

- **Top-of-message hint** when any part is a task (line 1441): `<shortcut> view subagents`.

- **`SubagentFooter`** at `routes/session/subagent-footer.tsx`: when viewing a child session (`session()?.parentID` set), draws a left-bordered footer with `<AgentName> (i of N) · <tokens> · <cost>` and Parent / Prev / Next buttons dispatching `session.parent`, `session.child.previous`, `session.child.next`.

- **Dialogs** at `routes/session/dialog-subagent.tsx` and `component/dialog-agent.tsx`.

**Parallelism**: the processor awaits all in-flight tool calls in parallel via `Effect.forEach(Object.values(ctx.toolcalls), call => Deferred.await(call.done), { concurrency: "unbounded" })` (`processor.ts:723`). Tool calls from a single LLM step run as concurrent `Fiber`s; their `ToolPart`s update independently as their `state` transitions. Multiple subagents are sibling child sessions navigable via the footer. README documents built-in agents `build` (default, full-access), `plan` (read-only), and `general` (subagent invokable with `@general`).

## State model

1. **Session status** at `packages/opencode/src/session/status.ts:8`:
   ```ts
   Info = Schema.Union([
     { type: "idle" },
     { type: "retry", attempt, message, action?, next },
     { type: "busy" },
   ])
   ```
   Published as `Event.Status`. Mirrored into `store.session_status[sessionID]` (`sync.tsx:248`), drives the prompt-bar spinner / retry banner (`prompt/index.tsx:150,1623`). Retry banner shows truncated error message, attempt #, live countdown (`prompt/index.tsx:1657-1690`).

2. **Per-tool-call** at `message-v2.ts:248-308`: `pending → running → completed | error`. Transitions in `ensureToolCall` (`processor.ts:267`, creates as pending), `case "tool-call"` (`processor.ts:411`, promotes to running with input), `case "tool-result"` (completed), `case "tool-error"` (error). Each fires a `message.part.updated` SSE event.

3. **Reasoning lifecycle**: implicit — `time.start` only = streaming; `time.start + time.end` = done. Drives the three-way `<Switch>` in `ReasoningPart`.

4. **Assistant message completion**: `message.time.completed` plus `message.finish`. `pending()` memo (`routes/session/index.tsx:206`) finds the assistant message with no `time.completed`; `final()` memo (line 1410) is true when `finish` is a non-tool-calls reason. The `▣ Mode · model · duration` footer only renders when `final()` or `props.last`.

## Notable design decisions

- **SolidJS + OpenTUI, not Bubble Tea/Ink/React.** OpenTUI provides JSX primitives `box`, `scrollbox`, `text`, `spinner`, `code`, `markdown`, `diff`, `line_number`. Fine-grained reactivity means a streaming token only repaints one text node.
- **16 ms event-batching at the SSE boundary** (`sdk.tsx:46-72`) wrapped in Solid `batch(...)` prevents per-character renders during fast deltas.
- **Two visual weights for tools.** Inline (one row) for cheap work; block (left-border panel with `theme.backgroundPanel`) when there's something worth reading (diffs, shell output, todos, multi-question forms). `showDetails()` toggle hides successful tool calls entirely.
- **Left-border-only panels.** Both user messages and block tools use a custom `SplitBorder.customBorderChars` with `border={["left"]}`. The prompt bottom-left uses `╹` for visual continuity (`prompt/index.tsx:1473`).
- **Agent-colored chrome.** User message left-border in `local.agent.color(message.agent)`; prompt spinner uses fade-pulse "blocks" frames generated by `createFrames({ color: agentColor, style: "blocks" })` (`prompt/index.tsx:1447`). Plan vs build turns are color-distinguishable.
- **Reasoning collapses by default with title extraction.** `reasoningTitle()` pulls the `**Title**` line out of OpenAI/Copilot reasoning summaries so the collapsed form is meaningful (`+ Thought: <title> · 4.3s`), not a bare duration (`index.tsx:1521, 1571`).
- **Reverted history is hidden, not deleted.** Server-side undo/redo durable across reconnects; UI filters out messages past the revert point and shows a clickable "N message reverted" pill (`index.tsx:1132-1190`).
- **Subagent task box shows live child activity** (`index.tsx:2046-2093`). The parent's task card reads child session parts every render — "what is my subagent doing right now" without leaving the parent.
- **`message.part.delta` is a BusEvent, not a SyncEvent.** Compare `message-v2.ts:530` (`PartUpdated` = SyncEvent) vs `536` (`PartDelta` = BusEvent). The delta is a transport optimization not part of the persisted event log; canonical post-stream state is in the final `PartUpdated`.
