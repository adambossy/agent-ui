# Toad — Agent UI Research

## TL;DR

Toad is a **rich local UI client** for coding agents, not an agent runtime itself. Its design centers on **incremental streamed Markdown rendering**, **tool calls as first-class UI blocks**, a **subprocess-based async architecture**, **one active turn per session** with **parallelism via multiple sessions/agents**, and **ACP as the connection layer** between the UI and the agent process.

## Important: ACP Disambiguation

There are **two different "ACP" protocols**:

- **Agent Client Protocol** → the one **Toad uses**
  - Site: `agentclientprotocol.com`
  - Purpose: connect **editor/UI clients** to **coding agents**
  - Transport: typically **JSON-RPC 2.0 over stdio** for local agents

- **Agent Communication Protocol** → a different protocol
  - Site: `agentcommunicationprotocol.dev`
  - Purpose: agent-to-agent / app-to-agent interoperability

## 1. How Toad renders agent output

Toad emphasizes **streaming Markdown**, not plain terminal line dumps.

Supported rendering:
- Streaming Markdown
- Syntax-highlighted code fences
- Tables, quotes, lists
- Flicker-free partial updates
- Copyable, non-garbled scrollback

### Key implementation ideas (from Will McGugan's streaming markdown article)

1. **Treat Markdown as top-level blocks** — Only the **last block** is mutable while streaming. Earlier blocks are finalized.
2. **Avoid re-rendering the whole document** — Preserves finalized blocks, updates only the trailing block.
3. **Update the last block in place when possible** — If the last block remains the same type (e.g. paragraph stays paragraph), it updates that widget rather than replacing it.
4. **Parse only the tail of the document** — Stores the line where the last block begins and reparses only from there onward, keeping parse time sub-1ms even for large documents.
5. **Coalesce incoming chunks/tokens** — If tokens arrive faster than the renderer can paint, new tokens are **concatenated into a buffer** rather than queued one-by-one. UI stays only a few ms behind the model.

### Semantics
- Output arrives as small chunks
- Chunks are merged into a current assistant message
- Rendering is **block-aware**, not just text-aware
- UI remains responsive with large outputs

## 2. How Toad handles and displays tool calls

### ACP tool call model
In ACP, tool calls are reported via `session/update` notifications:
- `tool_call`
- `tool_call_update`

Tool calls have:
- `toolCallId`
- `title`
- `kind`
- `status`

Content types:
- Regular text
- **Diffs**
- Embedded **terminal output**

The protocol also supports:
- **Permission requests** via `session/request_permission`
- Status transitions: pending → in_progress → completed → failed → cancelled

### Toad's tool UI (inferred)
Toad likely renders tool calls as **structured blocks** with:
- Icon/kind
- Title
- Live status
- Expandable or inline content
- Special renderers for:
  - **Diffs** (side-by-side or unified)
  - **Terminal output**
  - Text/progress
  - Permission prompts

Public evidence:
- Toad explicitly advertises "beautiful diffs"
- Rich shell/terminal support
- A GitHub discussion references a bug: "Long tool call is truncated when asking permission to run"

## 3. Async/streaming architecture and ACP semantics

### Toad's architecture
- **Frontend UI** in Python/Textual
- **Backend agent process** as a separate subprocess
- Communication over **stdin/stdout**

### ACP transport and lifecycle (local agents)
- JSON-RPC 2.0 over stdio
- Agent runs as a subprocess of the client

### Typical ACP flow
1. `initialize` — version negotiation, capabilities exchange
2. `session/new` or `session/load` — with absolute `cwd`, optional MCP server configs
3. `session/prompt` — user message/content sent
4. Many `session/update` notifications during the run
5. Final response to original `session/prompt` with `stopReason`

### ACP update types
- `agent_message_chunk`
- `user_message_chunk`
- `thought` chunks
- `tool_call`
- `tool_call_update`
- `plan`
- Command/mode updates

### Practical model
- One session
- One active prompt turn
- Many streamed updates/events
- UI state built incrementally from those events

## 4. How Toad handles cancellation

### ACP cancellation semantics
Client sends:
```json
{
  "method": "session/cancel",
  "params": { "sessionId": "..." }
}
```

Client should:
- Immediately mark unfinished tool calls as **cancelled**
- Respond to any pending permission requests with **cancelled**

Agent should:
- Abort LLM work and tool calls ASAP
- Optionally send final updates
- Respond to original `session/prompt` with stop reason **`cancelled`**

Important:
- **Late updates are allowed** after `session/cancel` but only **before** the final `session/prompt` response
- Client should still accept those updates

### Key pattern
Cancellation is **cooperative, not instantaneous**. Model as:
1. User requested cancel
2. Local optimistic state update
3. Drain remaining updates
4. Turn completes as cancelled

## 5. How it queues or handles multiple user messages

**No evidence** that Toad supports per-session message queue where multiple prompts are stacked while one run is in flight.

ACP's prompt-turn lifecycle strongly suggests **one active turn per session**:
- Send `session/prompt`
- Receive updates
- Wait for final stop reason
- Then send the next `session/prompt`

ACP docs explicitly say:
> Once a prompt turn completes, the client may send another `session/prompt`

### Concurrency model
- **Serial turns within a session**
- **Parallelism via multiple sessions/agents**

## 6. Sub-agent or parallel execution support

### Supported today
- **Multiple concurrent sessions** potentially with **different agents/providers**
- Screen to show current state of all agents (`ctrl+s`)

### Not supported today
- No first-class sub-agent orchestration UI

### Future direction
Will McGugan has stated:
- Toad should eventually be able to **run subagents**
- And allocate **any agent to any job**
- UX still to be figured out

### Conclusion
Today, "parallel" in Toad means **multiple independent sessions/agents**, not nested sub-agent trees inside a single run.

## 7. Overall UI/UX patterns

### Core patterns
1. **Rich prompt editor** — Markdown-aware input, syntax highlighting, mouse + keyboard editing, code fence highlighting
2. **`@` file insertion** — Fuzzy file picker, respects `.gitignore`, file tree view
3. **Notebook-like conversation blocks** — Navigate block-by-block, copy content, export as SVG
4. **Beautiful rendered output** — Markdown, diffs, tool-call blocks, shell output
5. **Real shell integration** — `!` for shell commands, full-color interactive TUIs, tab completion
6. **Multi-session management** — Run multiple agents, view all session states, resume prior sessions
7. **Flicker-free terminal UX** — No full reflow redraws, partial screen updates, stable scrollback, copyable text

### Key design lesson
**Treat the agent UI like a document/workbench, not like a terminal transcript.** Messages are structured blocks, tool calls are blocks, terminals are embedded blocks, diffs are blocks, prior blocks remain interactable.

## 8. How Toad implements ACP

### Connection model
For local ACP agents, Toad likely:

1. **Spawns agent subprocess** with stdio pipes connected
2. **`initialize`** — Sends supported ACP version, client capabilities (file read/write, terminal support), client info. Agent returns negotiated version, capabilities, auth methods
3. **`session/new` or `session/load`** — With absolute `cwd`, optional MCP server configs. If loading, agent replays prior conversation as `session/update` events
4. **`session/prompt`** — User message/content sent
5. **Streams updates** — Listens for agent message chunks, thought chunks, plans, tool calls, tool call updates
6. **Final turn completion** — Agent resolves original `session/prompt` with `stopReason`
7. **Cancellation** — Toad sends `session/cancel`

### MCP support through ACP
ACP session setup lets client pass MCP servers to agent. ACP is the path for client-provided tools/MCP exposure. Toad does not yet have a full MCP server UI, though planned.

### Ecosystem model
- Native ACP agents
- ACP-wrapped/adapted existing agent CLIs (via adapters)

## Sources

- Toad GitHub: github.com/batrachianai/toad
- Will McGugan: Toad release post (willmcgugan.github.io/toad-released/)
- Will McGugan: Announcing Toad (willmcgugan.github.io/announcing-toad/)
- Will McGugan: Efficient streaming of Markdown in the terminal (willmcgugan.github.io/streaming-markdown/)
- Agent Client Protocol docs (agentclientprotocol.com)
- LangChain ACP docs (docs.langchain.com/oss/python/deepagents/acp)
