# OpenClaw — Agent UI Research

## TL;DR

OpenClaw's web UI is **Gateway-first**: the browser sends a non-blocking chat request, gets an immediate ack with a `runId`, then renders the run from **structured WebSocket events** rather than waiting for one big HTTP response. The strongest design patterns are: **server-authoritative session state, explicit assistant/tool/lifecycle streams, per-session queuing, and session-scoped cancellation**.

## Architecture Overview

- Official browser Control UI is a **Vite + Lit SPA** served directly by the Gateway
- Connected over the **same Gateway WebSocket**
- Gateway is single source of truth for all state

## 1. How it renders agent output

### Control UI / browser chat
- `chat.send` is **non-blocking**: immediate ack `{ runId, status: "started" }`, response streams via **`chat` events**
- Agent loop emits:
  - `assistant` stream events for text deltas
  - `tool` stream events for tool activity
  - `lifecycle` stream events for start/end/error
- Chat layer buffers assistant deltas into chat-level updates, emits final event on lifecycle end/error

### Important: two streaming models
OpenClaw distinguishes between:
- **Internal UI streaming** via WS events in the Control UI (true token streaming)
- **Channel streaming** (Telegram/Discord/Slack/etc.) — NOT true token streaming

For messaging channels:
- **Preview streaming**: send + edit/update a temporary message
- **Block streaming**: coarse completed chunks as normal messages (~800–1200 chars), with paragraph/newline/sentence preferences and coalescing

**Design takeaway**: Treat "web UI live stream" and "message-channel stream" as different problems.

## 2. How it handles and displays tool calls

### Semantics
- Tool events emitted on a dedicated **`tool` stream**
- Control UI can stream tool calls and show **live tool output cards in chat**
- Tool results sanitized for size/media before logging and emitting

### UI pattern
From source (`ui/src/ui/app.ts`):
- App keeps a `toolStreamById` map
- Sidebar/open-detail handlers for tool output
- Pattern: tool entry/card in chat → expandable/full-detail view for larger output

### Tool lifecycle
Tools modeled as structured stateful objects:
- started
- updating
- completed/error

## 3. Async/streaming architecture and semantics

### Core architecture
- Single **Gateway WebSocket control plane**
- Typed protocol:
  - First frame must be `connect`
  - Then request/response + server-push events
- Event types include: `agent`, `chat`, `presence`, `health`, `cron`

### Agent execution semantics
- `agent` RPC validates params, resolves session, returns immediately with acceptance info
- Actual run performed asynchronously
- `subscribeEmbeddedPiSession` bridges runtime events into OpenClaw streams:
  - tool → `stream: "tool"`
  - assistant deltas → `stream: "assistant"`
  - lifecycle → `stream: "lifecycle"`

### Chat semantics
- `chat.send` is non-blocking
- `chat.history` fetched separately
- `chat.inject` can append assistant note to transcript **without** starting agent run

### Idempotency
- Side-effecting methods require **idempotency keys**
- Re-sending same key yields: `in_flight` while running, `ok` after completion

### Client responsibility
- Events are **not replayed**
- If UI misses a stream gap, it should refresh state/history

**Design takeaway**: Command ack → structured event stream → fetch-on-reconnect for reconciliation.

## 4. How it handles cancellation

### User-facing behavior
- Control UI has a **Stop** button
- Calls `chat.abort`
- Users can also type `/stop` or phrases like "stop run"

### API semantics
- `chat.abort` can abort by `{ sessionKey }`
- Cancellation is **session/run scoped**, not tied to a particular browser tab

### Partial-output policy
When a run is aborted:
- Partial assistant text can remain visible
- Gateway can persist aborted partial output into transcript
- Transcript entries include abort metadata

### Runtime cancellation sources
- AbortSignal
- Agent timeout
- Disconnect / RPC timeout

**Important**: `agent.wait` timeout only times out the *waiter*; it does **not** stop the agent run.

**Design takeaway**: Cancel is a first-class state transition, not just a socket close.

## 5. How it queues or handles multiple user messages

### Queue architecture
- Tiny **in-process lane-aware FIFO**
- Per-session serialization: one active run per session key
- Global lane caps total concurrency

### Defaults / lanes
- Default unconfigured lane concurrency: 1
- `main` lane default: 4
- `subagent` lane default: 8

### Queue modes
- `collect` — default; coalesce queued inbound messages into one followup turn
- `followup` — wait for current run to finish, then handle next
- `steer` — inject inbound message into current run
- `steer-backlog` — steer now and preserve for followup
- `interrupt` — abort active run, then run newest message

### Most interesting semantic
In `steer` mode, the queue is checked **after each tool call**:
- If queued user message exists:
  - Remaining tool calls from current assistant message are skipped
  - Skipped tools get error tool results: `"Skipped due to queued user message."`
  - Queued message injected before next assistant response

Safety/UX compromise: not mid-token interruption, not arbitrary re-entry, interruption only at **tool boundaries**.

### Overflow controls
- `debounceMs`
- `cap`
- `drop: old | new | summarize`

### UX detail
- Typing indicators can still fire immediately on enqueue

**Design takeaway**: OpenClaw's queue model is more useful than the usual "disable input while generating".

## 6. Sub-agent or parallel execution support

### Multi-agent routing
Gateway can host multiple isolated agents with separate:
- workspace, state dir, auth profiles, session store
- Routing deterministic via bindings by channel/account/peer/etc.

### Agent-to-agent communication
Session tools:
- `sessions_list`
- `sessions_history`
- `sessions_send`
- `sessions_spawn`

### Sub-agent behavior (`sessions_spawn`)
- Spawns new isolated session like `agent:<agentId>:subagent:<uuid>`
- Returns immediately with `{ status: "accepted", runId, childSessionKey }`
- Result announced back to requester channel after completion
- Can override: agentId, model, thinking level, timeout, thread binding
- Sub-agents:
  - Do **not** get session tools by default
  - Cannot spawn more sub-agents
  - Auto-archive later
- Dedicated `subagent` queue lane enables parallelism

### UI implication
No rich DAG/tree visualization in Control UI. Sub-agents surfaced as:
- Isolated sessions
- Announce-back results
- Session listings/history

**Design takeaway**: Runtime supports sub-agents; UI is intentionally simple — separate session objects + result announcements.

## 7. Overall UI/UX patterns

### Main patterns
- Chat tab for live interaction
- Tool output cards in chat
- Stop button
- Sessions panel / per-session overrides
- Channel status + QR login
- Skills panel
- Cron/jobs panel
- Nodes panel
- Logs tail
- Debug/event log/manual RPC

### Output display philosophy
Separate:
- Transcript/history
- Live stream
- Tool activity
- Ops/debugging

History bounded/truncated for UI safety. Oversized entries replaced with placeholders.

### Security/ops flavor
- Explicitly an **admin surface**, not meant for public exposure
- Strong auth/pairing story
- Remote access via Tailscale/SSH is first-class

### Good patterns to borrow
- Tool activity visually distinct from assistant prose
- Immediate send ack
- Stop is obvious
- Oversized artifacts don't explode chat layout
- Session-level controls live near the chat system

## 8. State management approach

### Frontend state management
From repo source, Control UI uses:
- Large top-level LitElement (`ui/src/ui/app.ts`)
- Many reactive `@state` fields
- Helper modules/controllers for feature areas
- Direct WebSocket client integration
- Local Maps/Sets for ephemeral UI state
- **No external store** (Redux/Zustand/MobX)

Examples:
- `toolStreamById = new Map(...)`
- Session/chat/cron/loading/error state fields
- UI layout state like split ratio
- Helper modules: `app-chat.ts`, controllers, storage helpers

### Browser persistence
Deliberately minimal:
- `gatewayUrl` → `localStorage`
- token → `sessionStorage`
- password → memory only
- locale → browser storage

### Backend/state authority
**Gateway is source of truth:**
- Chat history always fetched from Gateway
- No local file watching in WebChat
- Sessions, presence, config, health all live in Gateway/server state
- Transcripts persisted as JSONL on disk

**Design takeaway**: Thin-client / authoritative-server model. For an agent UI, usually the right call.

## What OpenClaw does less of

Useful for design decisions:
- **No channel-token streaming**: messaging channels use preview edits or block chunks, not raw token streams
- **No rich sub-agent graph UI**: runtime supports it; UI is simpler
- **No heavy frontend store architecture**: leans on Gateway truth + Lit state
- **Thinking/reasoning display**: controls exist, some reasoning streaming in channel modes, but browser docs emphasize assistant/tool/lifecycle and tool cards more than raw reasoning-token UX

## Risks and Guardrails

- **Don't let the client be the source of truth** — reconnects, aborts, multi-device use become painful
- **Don't model tools as text blobs** — you'll regret it when adding cancellation, retries, nested work, or approvals
- **Don't allow arbitrary mid-token interruption** — "interrupt at tool boundaries" is safer
- **Don't mix history fetch and live stream semantics** — keep reconciliation explicit
- **Keep large artifacts out of chat flow** — truncate, summarize, or side-panel them

## Sources

- GitHub: github.com/openclaw/openclaw
- Control UI docs: docs.openclaw.ai/web/control-ui
- Web docs: docs.openclaw.ai/web
- WebChat docs: docs.openclaw.ai/web/webchat
- Gateway architecture: docs.openclaw.ai/concepts/architecture
- Agent runtime: docs.openclaw.ai/concepts/agent
- Agent loop: docs.openclaw.ai/concepts/agent-loop
- Streaming/chunking: docs.openclaw.ai/concepts/streaming
- Queue: docs.openclaw.ai/concepts/queue
- Multi-agent routing: docs.openclaw.ai/concepts/multi-agent
- Session tools / subagents: docs.openclaw.ai/concepts/session-tool
- Control UI source: github.com/openclaw/openclaw/blob/main/ui/src/ui/app.ts
