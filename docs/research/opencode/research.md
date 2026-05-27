# OpenCode — Agent UI Research

## TL;DR

The active OpenCode repo is **`anomalyco/opencode`**; the older `opencode-ai/opencode` is archived. OpenCode does **not** treat the terminal as the source of truth: it models agent output as **typed message parts** on the server, streams updates over **SSE**, and lets the TUI act as a reactive client. The most reusable pattern is: **server-authoritative session/message/part state + structured streaming events + per-session single-flight execution with queueing + child sessions for subagents**.

## Architecture Overview

- Running `opencode` starts **both a server and a TUI**
- The **TUI is a client** talking to the server
- The server exposes:
  - OpenAPI
  - SDK
  - SSE event streams (`/event`, `/global/event`)
  - Session/message APIs
  - TUI control endpoints

**Design takeaway:** Treat the UI as a subscriber to structured state, not as the thing directly consuming token bytes.

## 1. How OpenCode renders agent output

### Typed parts model
Output is structured as typed message parts, not one undifferentiated blob:
- `text` — grows incrementally via part updates
- `thinking` / `reasoning` — separate blocks, togglable with `/thinking`
- `tool` — distinct execution blocks
- `step-start` / `step-finish`
- `subtask`
- Error/status updates

The server updates message parts incrementally, and clients render those updates in real time.

### Rendering style
- **Streaming text**: text grows incrementally via part updates
- **Markdown rendering**: enabled by default (OpenTUI markdown rendering)
- **Thinking/reasoning**: shown as separate blocks, togglable
- **Tools**: shown as distinct execution blocks, not blended into plain text
- **Execution summaries**: pending tool call counts, active tool arrow indicators, spinner animations for task/subagent display

### Design takeaway
Model a response as one assistant message containing many typed, independently updating parts. Much easier to render than raw token streams once you add tools, thoughts, subagents, and cancellation.

## 2. How it handles and displays tool calls

### Tool part model
Tool parts carry:
- Tool name
- Call ID
- `status`: `running` / `completed` / `error`
- Input, output
- Title, metadata
- Timestamps

For bash specifically, stdout/stderr streams into the tool part metadata while the command is running, then finalizes into a completed tool part.

### UI behavior
- `/details` toggles tool execution details
- Default UX is **summary-first, details-on-demand**
- Tool calls are visible in the conversation timeline, not invisible side effects

### Recommended baseline
- **Collapsed tool row** while running: icon, tool name, short description/title, spinner/status
- **Expandable details**: args, streamed logs/output, exit/result metadata

## 3. Async/streaming architecture and semantics

### Core pipeline
1. User prompt stored as user message
2. Session loop starts (or queues if already busy)
3. Server assembles: history, system prompt, tools, compaction/subtask handling
4. Runs model via **AI SDK `streamText`**
5. Consumes `fullStream` events: text deltas, tool calls, tool results, step start/finish, errors
6. Each event updates persisted session/message/part state
7. Updates broadcast on a **Bus**
8. Bus exposed to clients via **SSE**
9. TUI/SDK/web/desktop react to the same event stream

### Key semantic detail
This is **structured streaming**, not just token streaming. The unit of UI update is not "append these chars"; it is often:
- Update part X
- Mark tool Y running
- Append text to part Z
- Finish step N
- Set session idle

### Event types
- `message.part.updated`
- `message.updated`
- `session.status`
- `session.idle`
- `session.updated`
- Tool and permission-related events

### Design takeaway
Stream events over a typed event bus, not raw text chunks only. Essential once you need tool calls, thoughts, subagents, cancel, replay, and multiple clients.

## 4. How it handles cancellation

### Implementation
- Single **`AbortController`** per session in in-memory state
- `cancel(sessionID)` aborts it, removes session from active state, sets status to idle
- Server API: `POST /session/:id/abort`

### Propagation
Abort signal propagated into:
- Model streaming
- Tool execution contexts
- Shell commands

For bash:
- Process tree kill attempted on abort
- Output updated with user-aborted note

### Design takeaway
Use a **single cancellation token per run**, and pass it through model stream, tool runner, subprocess manager, and UI state. Gives consistent stop semantics.

## 5. How it queues or handles multiple user messages

### Single-flight with queue
- Active session state stores: `abort`, `callbacks[]`
- If a loop is already running for that session, a new prompt does **not** start a second concurrent loop
- Instead, it gets queued via callbacks / resumed processing

### Semantics
- Within a single session: **one active run at a time**, later prompts serialized
- Across sessions: multiple sessions can run **in parallel**

### Known issue
`prompt_async` can process messages without them appearing in the TUI in some versions — backend queueing works but UI visibility for externally injected prompts has had edge cases.

### Design takeaway
- Do not allow arbitrary concurrent runs in one conversation
- Use **per-thread single-flight + queue**
- Allow concurrency at the **session / child-session** level

## 6. Sub-agent or parallel execution support

### Built-in agents
- Primary agents: `build`, `plan`
- Sub-agents: `general`, `explore`

Sub-agents can be:
- Invoked automatically by primary agents
- Manually invoked with `@mentions`

### Parallelism
Docs explicitly say the `general` subagent is used to **run multiple units of work in parallel**.

### UI model
Sub-agents create **child sessions**:
- Server API: `/session/:id/children`
- TUI navigation: enter first child, cycle child sessions, return to parent

OpenCode does **not** flatten all subagent output into one noisy main timeline. It uses a **session tree**.

### Design takeaway
Subagent = separate session/run context. Parent references child. UI lets user navigate among them. Better than dumping all subagent logs inline.

## 7. Overall UI/UX patterns

### Core patterns
1. **Conversation-first timeline** — Everything shows as conversation artifacts: user messages, assistant text, thinking blocks, tool runs, shell results, subtask outputs
2. **Summary-first, details-on-demand** — Tool details togglable, thinking togglable, active execution summarized compactly
3. **Mode switching is visible and lightweight** — `Tab` switches between Build and Plan, visible mode indicator
4. **Navigation is session-centric** — Session list, continue/resume, child-session navigation for subagents
5. **Terminal-native affordances** — `@` for file references, `!` for shell commands, slash commands, keyboard-driven

### Display controls
- `/thinking` → show/hide reasoning
- `/details` → show/hide tool execution detail
- TUI config controls scroll behavior and diff style

### Key UI lesson
Avoid overloading the main assistant text block. **Separate semantic channels**: answer text, thoughts, tool activity, subagent work.

## 8. State management approach

### Layered model

#### Persistent / authoritative server state
- Session
- Message
- Part

Message parts are typed and updated independently.

#### In-memory execution state
Per active session:
- Busy/idle status
- Abort controller
- Queued callbacks

#### Event distribution
State changes emit events:
- `message.part.updated`
- `message.updated`
- `session.status`
- `session.idle`
- `session.updated`
- Tool and permission-related events

### Architectural style
- **Server-authoritative normalized state**
- Plus **event-driven incremental updates**
- With the TUI as a subscriber

### Design takeaway
Source of truth on server. Typed event stream to clients. Local UI state = derived/rendering state only. Ages much better than a purely client-owned stream assembler.

## Risks and Guardrails

1. **Granular streaming can become expensive** — Batch UI repaints even if you persist every part update
2. **External async prompts can drift from visible UI** — Ensure UI subscribes to canonical session events, not just locally initiated actions
3. **Event shape drift** — Define one canonical event contract for your UI
4. **Cancellation must be end-to-end** — If the model cancels but tools keep running, UX becomes misleading. Pass one cancel token through everything.

## Sources

- Active repo: github.com/anomalyco/opencode
- Server docs: opencode.ai/docs/server/
- TUI docs: opencode.ai/docs/tui/
- Agents docs: opencode.ai/docs/agents/
- CLI docs: opencode.ai/docs/cli/
- SDK docs: opencode.ai/docs/sdk/
- Plugins/event docs: opencode.ai/docs/plugins/
- Source: `packages/opencode/src/session/prompt.ts`
- Moncef Abboud's "How Coding Agents Actually Work: Inside OpenCode"
