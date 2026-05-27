# Pi (pi.dev / badlogic/pi-mono) — Agent UI Research

## TL;DR

Pi's core agent is **terminal-first**, with a reusable **browser UI** in `packages/web-ui`. The strongest patterns to borrow are: **event-driven streaming**, **stable-history + separate in-flight rendering**, **tool calls rendered inline and keyed by toolCallId**, and **two distinct queued-message semantics**: **steer** vs **follow-up**.

## Important Caveat

pi.dev itself is a landing/docs site for a terminal coding agent. The repo **does** include a browser UI library (`@mariozechner/pi-web-ui`), which is the closest source for "Pi web UI" behavior. The practical split is:
- **Actual Pi product UX**: mostly the **terminal UI**
- **Browser UI implementation**: `packages/web-ui`

Message queueing is rich in the TUI but not exposed the same way in the browser UI package.

## 1. How it renders agent output

### Core streaming model
Pi streams at the **event level**, not just raw text chunks.

In `packages/agent/src/agent-loop.ts`, the LLM stream emits:
- `start`
- `text_start` / `text_delta` / `text_end`
- `thinking_start` / `thinking_delta` / `thinking_end`
- `toolcall_start` / `toolcall_delta` / `toolcall_end`
- `done`
- `error`

Normalized into higher-level agent events:
- `message_start` / `message_update` / `message_end`
- `turn_start` / `turn_end`
- `agent_start` / `agent_end`

### Rendering pattern
Both UIs follow the same general idea:
- Keep **completed history stable**
- Render the **currently streaming assistant message separately**
- Update that in-flight view on `message_update`

### Browser UI (`packages/web-ui`)
Key components:
- `src/components/AgentInterface.ts`
- `src/components/MessageList.ts`
- `src/components/StreamingMessageContainer.ts`

Renders:
- A **stable `message-list`** for finished messages
- A separate **`streaming-message-container`** for the in-flight assistant message

`StreamingMessageContainer` batches updates with `requestAnimationFrame` and deep-clones the pending message before rendering so Lit sees nested mutations like streaming tool args.

### TUI (`packages/coding-agent`)
- Finished messages stay in chat history
- A dedicated streaming assistant component is created on `message_start`
- Updated on `message_update`, finalized on `message_end`
- Uses **retained-mode + differential rendering** — only changed lines are redrawn

### Thinking display
Thinking is rendered as a first-class content block:
- Browser: `ThinkingBlock`
- TUI: collapsible thinking blocks
- Treated as **separate renderable content**, not mixed into plain assistant text

## 2. How it handles and displays tool calls

### Tool calls are part of assistant content
Pi models tool calls as assistant message content blocks, not separate top-level chat turns.

In `Messages.ts`, assistant content is rendered in order:
- text
- thinking
- toolCall

The UI preserves the exact interleaving (prose → thinking → tool call → more prose).

### Tool results are separate messages, shown inline
Internally, tool results are separate `toolResult` messages. Both UIs **pair them back to the originating tool call** using `toolCallId`:
- Assistant emits tool call block with `id`
- Tool executes
- Tool result message has `toolCallId`
- UI looks up result by `toolCallId`
- Result rendered inline under original tool call card

### Streaming tool args
Tool arguments are streamed incrementally:
- Tool call card created as soon as `toolCall` appears
- Args updated as more `toolcall_delta` events arrive
- TUI: on `message_update`, if new tool call → create `ToolExecutionComponent`; if existing → `updateArgs(...)`

Useful for: diffs, file writes, long command args, partially formed JSON args.

### Streaming tool execution output
Supports tool execution updates through:
- `tool_execution_start`
- `tool_execution_update`
- `tool_execution_end`

Built-in **bash tool** streams partial output via `onUpdate` in `packages/coding-agent/src/core/tools/bash.ts`.

### Browser tool rendering
Uses a registry with built-in renderers for:
- `bash`
- JS REPL
- extract-document
- artifacts
- Fallback default JSON renderer for unknown tools

## 3. Async/streaming architecture and semantics

### Clean layering
- **`pi-ai`**: provider abstraction + normalized streaming
- **`pi-agent-core`**: agent loop, tool execution, queues, abort
- **`pi-coding-agent`**: session management, compaction, TUI
- **`pi-web-ui`**: browser rendering/storage layer

### Agent loop semantics
`packages/agent/src/agent-loop.ts`:

- **Outer loop**: keeps going if follow-up messages exist after the agent would otherwise stop
- **Inner loop**: handles assistant response + tool execution + steering injections

Flow:
1. Inject pending user messages if any
2. Stream assistant response
3. If tool calls exist, execute them
4. Emit `turn_end`
5. If steering messages arrived, inject them before next assistant response
6. If no more work, check follow-ups
7. Stop only when no tools, no steering, no follow-ups

### Parallel vs sequential tool execution
Core supports:
- `toolExecution: "parallel"` (default)
- `toolExecution: "sequential"`

**Important nuance:**
- In **sequential** mode, steering can interrupt after the current tool and skip remaining ones
- In **parallel** mode, once runnable calls have started, they generally run to completion; steering mainly affects the next turn or not-yet-started calls

## 4. How it handles cancellation

### Core cancellation
`Agent` owns an `AbortController` and exposes `abort()`.

Abort signal passed to:
- The LLM stream
- Tool execution

If aborted:
- Assistant message gets `stopReason: "aborted"`
- Partial content may still be preserved
- UI shows aborted state

### Tool cancellation
Bash tool passes abort signal into process execution and kills process tree when needed. Cancellation propagated to actual tool runtime.

### UI cancellation
**TUI:**
- `Escape` aborts streaming
- Queued messages can be restored to editor on abort
- Long-running operations (auto-compaction, retry) temporarily repurpose Escape

**Browser UI:**
- `AgentInterface` wires input's abort control to `session.abort()`

### Resulting UX
Pi's cancellation model is: explicit, signal-based, reflected in message state, visible in UI.

## 5. How it queues or handles multiple user messages

### Two queue types (most interesting area)
Pi has **two different semantics**, not one generic queue:

#### Steering
- Delivered **after the current tool**
- Interrupts remaining planned work
- Intended for "stop that, do this instead"

#### Follow-up
- Delivered **only after the agent is done**
- Intended for "when you finish, also do X"

### Queue modes
Each queue has two delivery modes:
- `"one-at-a-time"`: default, safer
- `"all"`: deliver all queued messages together

Applies separately to steering and follow-ups.

### TUI UX
- `Enter` while streaming → queue **steering**
- `Alt+Enter` → queue **follow-up**
- Queued items visibly listed
- `Alt+Up` can restore queued messages to editor
- Abort can also restore queued text

### Browser UI gap
In `AgentInterface.sendMessage()`, if `session.state.isStreaming`, it simply returns instead of queueing.
- **TUI**: rich queue semantics
- **web-ui package**: currently "one message at a time"

**This is the single most relevant gap for a web UI design.**

## 6. Sub-agent or parallel execution support

### Core product: no built-in subagents
Pi's docs are explicit: **no built-in sub-agents**.

### Extension support exists
Example extension at `packages/coding-agent/examples/extensions/subagent/index.ts`:
- Spawns separate `pi` subprocesses in `--mode json`
- Each subagent gets isolated context
- Supports: **single**, **parallel**, **chain**

### Parallel execution
- Max tasks: 8
- Max concurrency: 4
- Streams progress back via tool updates

### UX implication
Subagents are treated as **tool calls**, not special top-level orchestration UI. Keeps core simple, puts orchestration complexity in extensions.

## 7. Overall UI/UX patterns

### TUI patterns
- Clear stacked layout: header, messages, editor, footer
- Inline tool cards
- Collapsible thinking
- Collapsible tool output
- Visible pending queue
- Token/cost/context footer
- Session tree navigation and branching
- Extension-inserted widgets/overlays

### Browser UI patterns
- Chat panel + optional artifacts panel
- Stable history + dedicated streaming area
- Inline tool rendering
- Markdown for assistant/user content
- Attachments preview
- Cost display
- Auto-scroll until user scrolls away
- Sandboxed artifact rendering for HTML/SVG/Markdown

### Most reusable pattern
**Completed history is immutable/stable; only the live message is mutable.** Simplifies rendering, virtualization, scroll behavior, cancellation, tool-call display.

## 8. State management approach

### Core in-memory state
`packages/agent/src/agent.ts` state includes:
- `systemPrompt`, `model`, `thinkingLevel`, `tools`
- `messages`, `isStreaming`, `streamMessage`
- `pendingToolCalls`, `error`

Small mutable state machine, updated by event processing.

### Session layer
`AgentSession` adds:
- Persistence
- Queue bookkeeping for UI
- Compaction, retry logic
- Extension runtime
- Session switching/forking/tree nav

### Persistence
- **Terminal**: Sessions are JSONL tree files via `SessionManager`
- **Browser**: `pi-web-ui` uses IndexedDB stores for settings, provider keys, sessions, custom providers

### Architecture style
- Small in-memory object state
- Event subscriptions
- Append-only-ish persistence layers
- **No global Redux-style store**

## Key Design Takeaways

1. **Event model**: `message_start/update/end`, `tool_execution_start/update/end`, `turn_start/end`, `agent_start/end`
2. **Two queued-message types**: `steer` and `followUp`
3. **Stable history + live buffer**: immutable completed transcript + separate mutable in-flight render
4. **Tool pairing by ID**: tool call in assistant content, tool result stored separately, joined by `toolCallId`
5. **Thinking as structured content**: separate block type, independent visibility/collapse state
6. **Abort as first-class state transition**: propagate `AbortSignal`, preserve partial content, render aborted state explicitly

## Primary Source Files

- `packages/agent/src/agent.ts`
- `packages/agent/src/agent-loop.ts`
- `packages/coding-agent/src/core/agent-session.ts`
- `packages/coding-agent/src/core/tools/bash.ts`
- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`
- `packages/coding-agent/examples/extensions/subagent/index.ts`
- `packages/web-ui/src/components/AgentInterface.ts`
- `packages/web-ui/src/components/MessageList.ts`
- `packages/web-ui/src/components/Messages.ts`
- `packages/web-ui/src/components/StreamingMessageContainer.ts`

## Sources

- GitHub: github.com/badlogic/pi-mono
- pi.dev website and documentation
- Package READMEs
