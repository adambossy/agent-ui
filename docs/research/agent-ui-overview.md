# Agent UI Design Research

## Research Summary: Agent UI Design Patterns

### Pi (pi.dev / badlogic/pi-mono) — The Coding Agent
- **Streaming**: Event-level streaming (`text_delta`, `thinking_delta`, `toolcall_delta`) normalized to `message_start/update/end`. Stable history + separate in-flight buffer
- **Tool calls**: First-class content blocks paired by `toolCallId`. Tool args stream incrementally. Tool execution output streams via `tool_execution_start/update/end`. Registry-based renderers with fallback
- **Architecture**: Clean layering (`pi-ai` → `pi-agent-core` → `pi-coding-agent` → `pi-web-ui`). Agent loop with outer (follow-ups) and inner (tool execution + steering) loops. Supports parallel and sequential tool execution
- **Cancellation**: `AbortController` propagated to LLM stream + tool execution + process tree. `stopReason: "aborted"` preserves partial content. TUI: `Escape` to abort
- **Queueing**: **Two queue types** — `steer` (interrupts after current tool) and `followUp` (runs after agent completes). Each has `one-at-a-time` or `all` delivery modes. TUI: `Enter` = steer, `Alt+Enter` = follow-up. **Browser UI currently blocks sends while streaming** (key gap)
- **Sub-agents**: No built-in; extension example spawns `pi` subprocesses with single/parallel/chain modes (max 8 tasks, 4 concurrent). Subagents treated as tool calls
- **Key lesson**: Two-queue semantics (steer vs follow-up) are the most interesting queueing model found. Stable history + live buffer is the cleanest rendering split

### Toad — The ACP Reference Client
- **Streaming**: Block-aware incremental Markdown rendering. Only the last block is mutable; earlier blocks finalize. Token coalescing prevents jank
- **Tool calls**: First-class UI blocks with `toolCallId`, `title`, `kind`, `status`, permission prompts, embedded diffs/terminal output
- **Architecture**: JSON-RPC 2.0 over stdio (local ACP). `session/prompt` → many `session/update` notifications → final stop reason
- **Cancellation**: Cooperative via `session/cancel` — cancellation is a state transition (cancelling → cancelled), late updates allowed before final close
- **Queueing**: Serial turns within a session; parallelism via multiple sessions
- **Sub-agents**: Multiple concurrent sessions today; nested sub-agent orchestration planned but not shipped
- **Key lesson**: Treat agent UI as a **document/workbench of structured blocks**, not a terminal transcript. ACP's update event types (`agent_message_chunk`, `thought`, `tool_call`, `tool_call_update`, `plan`) map directly to requirements

### OpenCode — The Full-Stack Reference
- **Streaming**: Typed message **parts** (`text`, `thinking`, `tool`, `step-start`, `step-finish`, `subtask`) updated independently via SSE
- **Tool calls**: First-class parts with lifecycle (`running` → `completed` → `error`), summary-first with details-on-demand toggle
- **Architecture**: Server-authoritative state + typed event bus over SSE. Server persists Session → Message → Part. TUI is just a reactive subscriber
- **Cancellation**: Single `AbortController` per session, propagated through model stream, tool runner, and subprocess manager
- **Queueing**: Single-flight per session with callback queue; new prompts serialize, don't start concurrent runs
- **Sub-agents**: First-class child sessions (`/session/:id/children`) — subagent work is a **separate navigable session**, not inline noise
- **Key lesson**: The most architecturally mature model. **Server owns state, clients subscribe to typed events, output is parts not text, subagents are child sessions**

### OpenClaw — The Gateway-First Web UI
- **Streaming**: Non-blocking `chat.send` returns `{ runId, status }` immediately. Three structured streams: `assistant` (text deltas), `tool` (tool activity), `lifecycle` (start/end/error). Distinct from channel streaming (preview edits / block chunks for Telegram/Discord/Slack)
- **Tool calls**: Dedicated `tool` stream with `toolStreamById` map. Live tool output cards in chat with expandable detail views. Tools modeled as stateful objects (started → updating → completed/error)
- **Architecture**: Single Gateway WebSocket control plane with typed protocol. Vite + Lit SPA. `chat.send` non-blocking, `chat.history` separate, `chat.inject` for notes without agent runs. Idempotency keys on side-effecting methods. Events NOT replayed — client must refresh on reconnect
- **Cancellation**: Stop button + `chat.abort` + `/stop` command. Session/run scoped (not tab-scoped). Partial text persisted with abort metadata. AbortSignal + agent timeout + disconnect timeout
- **Queueing**: Lane-aware FIFO with per-session serialization. Five queue modes: `collect` (coalesce), `followup`, `steer` (inject at tool boundaries), `steer-backlog`, `interrupt` (abort + run newest). Overflow controls: `debounceMs`, `cap`, `drop: old|new|summarize`. Concurrency lanes: main=4, subagent=8
- **Sub-agents**: `sessions_spawn` creates isolated child sessions. Returns immediately with `{ runId, childSessionKey }`. Results announced back. Sub-agents cannot spawn further sub-agents. Dedicated `subagent` queue lane. No rich DAG/tree UI — simple session objects + result announcements
- **Key lesson**: Most sophisticated queue model found (5 modes + overflow controls). Gateway-as-truth with thin client is the cleanest web architecture. "Interrupt at tool boundaries" is the right safety/UX compromise

## Top 5 Design Decisions

1. **Model output as typed parts** (text, thinking, tool_call, subtask), not a single stream
2. **Server-authoritative state** with SSE/event-stream to clients — critical for web→mobile portability
3. **One active run per conversation, queue the rest** — avoids interleaving bugs
4. **Cancellation as cooperative state transition** — not a hard kill; drain remaining events
5. **Sub-agents as child sessions** with parent→child navigation, not flattened inline

## Detailed Findings

### Pi — Deep Dive

#### Rendering
- Progressive text reveal during generation — "subtle and polished reveal" with type scroller animations
- Short, conversational replies by default; optimized for brevity and natural flowing style
- UI keeps attention on the current exchange, not a dense log of artifacts
- Voice mode ("Call Pi") supports hands-free phone-call-like interaction

#### Tool Handling
- Pi does not present tool calls as visible first-class UI objects
- Web search (added March 2024) is hidden behind the reply and woven into conversational text
- No visible tool call cards, expandable tool logs, step-by-step retrieval traces, or action results separated from assistant message
- Pi did not visibly credit sources in normal responses

#### Async Semantics
- Single active assistant turn at a time
- Server-side conversation/session state (conversations continue across platforms)
- Behaves like request → streamed assistant text → committed turn
- No public event schema or streaming protocol docs

#### Cancellation
- No strong evidence of a robust Stop/Cancel control in text UI
- During generation, users were restricted from scrolling up
- Once a message is sent, Pi starts responding immediately and user is restricted from typing again

#### Queueing
- Serial, not queued — strict turn-taking
- No evidence of queued follow-ups, multiple pending user messages, steering/interruption messages, or branch/fork controls

---

### Toad — Deep Dive

#### Rendering — Streaming Markdown Architecture
Key implementation ideas from Will McGugan's streaming markdown article:

1. **Top-level blocks**: Only the last block is mutable while streaming. Earlier blocks are finalized
2. **No full re-render**: Preserves finalized blocks, updates only the trailing block
3. **In-place updates**: If the last block remains the same type (e.g. paragraph stays paragraph), it updates that widget rather than replacing it
4. **Tail-only parsing**: Stores the line where the last block begins, reparses only from there onward — keeps parse time sub-1ms even for large documents
5. **Token coalescing**: If tokens arrive faster than the renderer can paint, new tokens are concatenated into a buffer rather than queued one-by-one

#### Tool Calls — ACP Model
ACP `session/update` notifications carry tool calls with:
- `toolCallId`, `title`, `kind`, `status`
- Content types: regular text, diffs, terminal output
- Permission requests via `session/request_permission`
- Status transitions: pending → in_progress → completed → failed → cancelled

Toad renders tool calls as structured blocks with:
- Icon/kind indicator
- Title
- Live status
- Expandable or inline content
- Special renderers for diffs, terminal output, text/progress, permission prompts

#### ACP Architecture
- Frontend UI in Python/Textual, backend agent as separate subprocess
- Communication over stdin/stdout using JSON-RPC 2.0

**Typical ACP flow:**
1. `initialize` — version negotiation, capabilities exchange
2. `session/new` or `session/load` — with absolute `cwd`, optional MCP server configs
3. `session/prompt` — user message/content sent
4. Many `session/update` notifications — agent_message_chunk, thought, tool_call, tool_call_update, plan
5. Final response to `session/prompt` with `stopReason`

**ACP update types:**
- `agent_message_chunk`
- `user_message_chunk`
- `thought` chunks
- `tool_call`
- `tool_call_update`
- `plan`
- Command/mode updates

#### Cancellation — ACP Semantics
Client sends `session/cancel` with `sessionId`. Then:
- Client immediately marks unfinished tool calls as cancelled
- Client responds to pending permission requests with cancelled
- Agent aborts LLM work and tool calls ASAP
- Agent optionally sends final updates
- Agent responds to original `session/prompt` with stop reason `cancelled`
- Late updates are allowed after `session/cancel` but only before final response

**Key pattern**: cancellation is cooperative, not instantaneous. Model as:
1. User requested cancel
2. Local optimistic state update
3. Drain remaining updates
4. Turn completes as cancelled

#### Multi-Session Concurrency
- Serial turns within a session
- Parallelism via multiple sessions/agents
- `ctrl+s` to show current state of all agents
- Sub-agent orchestration UI planned but not yet shipped

#### UI Patterns
- Rich Markdown-aware prompt editor with syntax highlighting
- `@` file insertion with fuzzy picker respecting .gitignore
- Notebook-like conversation blocks (navigate, copy, export as SVG)
- Beautiful rendered output (Markdown, diffs, tool blocks, shell output)
- Real shell integration (`!` for commands, full-color interactive TUIs)
- Flicker-free terminal UX (partial screen updates, stable scrollback)

---

### OpenCode — Deep Dive

#### Architecture Overview
- Running `opencode` starts both a server and a TUI
- TUI is a client talking to the server
- Server exposes: OpenAPI, SDK, SSE event streams (`/event`, `/global/event`), session/message APIs

#### Rendering — Typed Parts Model
Output is structured as typed message parts, not one undifferentiated blob:
- `text` — grows incrementally via part updates
- `thinking` / `reasoning` — separate blocks, togglable with `/thinking`
- `tool` — distinct execution blocks
- `step-start` / `step-finish`
- `subtask`
- Error/status updates

Each assistant message contains many typed, independently updating parts.

#### Tool Call Lifecycle
Tool parts carry:
- Tool name, call ID
- `status`: `running` / `completed` / `error`
- Input, output, title, metadata, timestamps

UI behavior:
- `/details` toggles tool execution details
- Default UX is summary-first, details-on-demand
- For bash: stdout/stderr streams into tool part metadata while running, then finalizes

#### Streaming Architecture
1. User prompt stored as user message
2. Session loop starts (or queues if already busy)
3. Server assembles history, system prompt, tools, compaction/subtask handling
4. Runs model via AI SDK `streamText`
5. Consumes `fullStream` events: text deltas, tool calls, tool results, step start/finish, errors
6. Each event updates persisted session/message/part state
7. Updates broadcast on a Bus
8. Bus exposed to clients via SSE
9. TUI/SDK/web/desktop react to the same event stream

**Event types:**
- `message.part.updated`
- `message.updated`
- `session.status`
- `session.idle`
- `session.updated`
- Tool and permission-related events

#### Cancellation
- Single `AbortController` per session in in-memory state
- `cancel(sessionID)` aborts it, removes session from active state, sets status to idle
- Server API: `POST /session/:id/abort`
- Abort signal propagated into model streaming, tool execution, shell commands
- For bash: process tree kill attempted on abort, output updated with user-aborted note

#### Queueing
- Single-flight execution per session with queue for additional prompts
- Active session state stores: `abort`, `callbacks[]`
- If loop is already running, new prompt is queued via callbacks / resumed processing
- Cross-session: multiple sessions can run in parallel

#### Sub-agents
Built-in agents:
- Primary: `build`, `plan`
- Sub-agents: `general`, `explore`

Sub-agents can be invoked automatically by primary agents or manually with `@mentions`. The `general` subagent explicitly supports running multiple units of work in parallel.

**UI model**: Sub-agents create child sessions:
- Server API: `/session/:id/children`
- TUI navigation: enter first child, cycle child sessions, return to parent
- Output is NOT flattened into main timeline — uses a session tree

#### State Management
Layered model:
- **Persistent/authoritative server state**: Session → Message → Part
- **In-memory execution state**: busy/idle status, abort controller, queued callbacks per session
- **Event distribution**: state changes emit typed events over SSE
- **TUI**: reactive subscriber to server events

---

## Comparison Matrix

| Feature | Pi | Toad | OpenCode |
|---|---|---|---|
| **Streaming** | Progressive text reveal | Block-aware incremental Markdown | Typed parts via SSE |
| **Tool visibility** | Hidden | First-class blocks | First-class parts |
| **Protocol** | Proprietary | ACP (JSON-RPC over stdio) | SSE + REST API |
| **Cancellation** | Minimal | Cooperative (`session/cancel`) | AbortController propagation |
| **Queueing** | None (strict turns) | Serial per session | Single-flight + callback queue |
| **Sub-agents** | None | Multi-session (planned nesting) | Child sessions with navigation |
| **State authority** | Server (inferred) | Agent subprocess | Server-authoritative |
| **Output model** | Single text stream | Structured blocks | Typed message parts |
| **Thinking tokens** | Not shown | Supported via ACP | Togglable blocks |
| **Target platform** | Web + mobile | Terminal (Textual) | Terminal (TUI) + server |

## Sources

- Inflection AI blog posts, App Store/Google Play listings
- Toad GitHub (github.com/batrachianai/toad), Will McGugan's blog posts on streaming Markdown
- Agent Client Protocol docs (agentclientprotocol.com)
- OpenCode repo (github.com/anomalyco/opencode), opencode.ai docs
- LangChain ACP documentation
- Moncef Abboud's "How Coding Agents Actually Work: Inside OpenCode"
