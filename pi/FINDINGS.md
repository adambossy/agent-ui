# earendil-works/pi — TUI / Static-HTML Rendering of the Agent Turn

## Headline

**pi is not a web application.** The repo at `https://github.com/earendil-works/pi.git` is a terminal-UI / CLI agent harness — no Vite/Next/Svelte config, no HTTP port, no DOM. The only HTML in the repo is `packages/coding-agent/src/core/export-html/template.html`, a single self-contained static replay produced by `pi --export <session.jsonl>` for already-recorded sessions. `npm install --ignore-scripts` and `npm run build` succeed; the CLI is runnable via `./pi-test.sh` but requires an LLM provider key (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` / `GOOGLE_API_KEY`) to serve traffic.

## Top three notable findings

1. **Unified event protocol drives all surfaces.** `AgentEvent` (`packages/agent/src/types.ts:403-418`) is a tagged-union stream of `agent_start | turn_start | message_{start,update,end} | tool_execution_{start,update,end} | turn_end | agent_end`. The TUI, the JSONL mode, the RPC mode, and the HTML exporter all consume the *same* events. Every `message_update` carries a full `partial: AssistantMessage` snapshot, so consumers always re-paint from the snapshot — no token-level diff tracking required.
2. **Tools are first-class UI citizens with two render hooks per tool.** Every tool definition exposes `renderCall(args, theme, ctx)` and `renderResult(result, options, theme, ctx)` (see `packages/coding-agent/src/core/tools/bash.ts:405-439`, `edit.ts:367-430`). The shared `ToolExecutionComponent` (`packages/coding-agent/src/modes/interactive/components/tool-execution.ts`) keeps a per-tool `state` bag between invocations so renderers can mutate the previous frame's component tree instead of allocating new ones — that's why streaming bash output and growing edit diffs don't flicker. Background color encodes status (`toolPendingBg | toolSuccessBg | toolErrorBg`, `tool-execution.ts:228-234`). The `edit` tool kicks off an async on-disk diff preview the moment streamed args complete (`edit.ts:381-390`) so the user sees the would-be change before execution even starts.
3. **Reasoning has a dedicated content type that ships alongside text and tool calls.** `ThinkingContent` (`packages/ai/src/types.ts:230-238`) appears in the same `AssistantMessage.content` array as text/toolCall blocks. The UI renders it italic in a `thinkingText` color via `AssistantMessageComponent.updateContent` (`assistant-message.ts:73-122`); `Ctrl+T` collapses it to a single "Thinking..." label that's customizable per-extension. Spacing between thinking and the next block is conditional — no blank row before tool boxes, blank row before text — preventing visual stutter (`assistant-message.ts:97-119`).

## Other notable points

- **No sub-agents in core.** `README.md:476` is explicit: a non-goal — use extensions, tmux, or third-party packages.
- **Parallel tool calls are supported** (`agent-loop.ts:451`), emit `tool_execution_end` in completion order, and the UI keys pending tools by `toolCallId` in a `Map` (`interactive-mode.ts:280`) so concurrent tool boxes update independently.
- **No central store.** State lives in three layers:
  - `Agent._state` (canonical transcript, `agent.ts:509-547`)
  - `AgentSession` (persistence + session events, `agent-session.ts:451`)
  - `InteractiveMode` class fields shadowing component handles (`interactive-mode.ts:240-280`)
  Re-renders are coalesced via `TUI.requestRender()` → `process.nextTick` → throttled `setTimeout` (`packages/tui/src/tui.ts:495-541`).
- **Streaming animations.** 80 ms braille spinner default (`packages/tui/src/components/loader.ts:11-12`). The bash tool drives its own per-second elapsed-timer redraw via `setInterval` (`bash.ts:417-419`).
- **Conversation history is a JSONL tree** (`id` + `parentId` per entry) supporting in-place branching, forking, cloning, and lossy compaction — see `packages/coding-agent/README.md:230-272` for the user-facing model and `packages/coding-agent/src/core/session-manager.ts` for the file format.
- **The only browser-renderable artifact pi produces is the static `--export` HTML** (`packages/coding-agent/src/core/export-html/template.{html,css,js}`). It uses the same theme variables and class-name semantics (`.tool-execution.pending|success|error`, `.thinking-block`, `.diff-added|removed|context`) as the TUI. CSS at `template.css:343-589`, JS dispatch at `template.js:1192-1276`. This is a post-hoc replay, not an interactive UI.

## AgentEvent variants (canonical streaming protocol)

`packages/agent/src/types.ts:403-418`:

```
agent_start       — agent harness booted
turn_start        — new user → assistant turn beginning
message_start     — assistant message slot opened
message_update    — { partial: AssistantMessage }, full snapshot
message_end       — assistant message finalized
tool_execution_start  — { toolCallId, name, args }
tool_execution_update — { toolCallId, partial }
tool_execution_end    — { toolCallId, result | error }
turn_end          — turn complete, status: completed | aborted | error
agent_end         — harness shutting down
```

## Content types within an AssistantMessage

`packages/ai/src/types.ts`:

- `TextContent` — `{ type: "text", text }`
- `ThinkingContent` (line 230-238) — `{ type: "thinking", text, signature? }`
- `ToolCallContent` — `{ type: "tool_call", id, name, input }`
- `ImageContent`, `RedactedThinkingContent`

The UI iterates `message.content[]` and emits one renderer per block. The same array carries reasoning, text, and tool calls — order is preserved exactly as emitted by the model.

## State model — per tool execution

States cycle through a 3-color background scheme in the TUI (`tool-execution.ts:228-234`):

- `toolPendingBg` — args being assembled / executing
- `toolSuccessBg` — result returned cleanly
- `toolErrorBg` — error / non-zero exit / rejection

In the static HTML export, these map to `.tool-execution.pending | success | error` CSS classes.

## Streaming pipeline (top to bottom)

1. **Model client** (Anthropic/OpenAI/Gemini SDK in `packages/ai/src/clients/`) emits delta events.
2. **Agent loop** (`packages/agent/src/agent-loop.ts`) translates them into the unified `AgentEvent` tagged-union.
3. **Agent** (`packages/agent/src/agent.ts:509-547`) merges deltas into `_state.messages[].content[]`. Every change emits a fresh `message_update` with `partial: AssistantMessage` snapshot.
4. **InteractiveMode** (`packages/coding-agent/src/modes/interactive/interactive-mode.ts:280`) listens; tool calls go through a `Map<toolCallId, ToolExecutionComponent>` so each updates independently.
5. **TUI render loop** (`packages/tui/src/tui.ts:495-541`) coalesces with `process.nextTick` + throttled `setTimeout`. Renderers mutate prior component trees in place rather than reallocating.

## Static HTML export (the only browser-renderable artifact)

- Template: `packages/coding-agent/src/core/export-html/template.html` (self-contained, no network)
- Theme + class semantics: `template.css:343-589`
- JS dispatch (turn navigation, block expand/collapse): `template.js:1192-1276`
- CSS classes that mirror the TUI:
  - `.tool-execution.pending | .success | .error`
  - `.thinking-block` (collapsible)
  - `.diff-added | .diff-removed | .diff-context`
  - `.message-user | .message-assistant`

## Artifacts written

- `/Users/adambossy/code/agent_ui/pi/BLOCKERS.md` — blocker writeup + options for unblocking (asciinema, `--export` HTML, or skip browser walkthrough).
- `/Users/adambossy/code/agent_ui/pi/SETUP.md` — clone/install/build/run instructions and how to produce an `--export` HTML if the next phase wants a browser target.
- `/Users/adambossy/code/agent_ui/pi/SERVER.md` — explicitly states no server is or can be running, lists available runtime entry points.
- `/Users/adambossy/code/agent_ui/pi/repo/` — cloned, built, ready to run.

## Blocker for the live walkthrough

Decide between:
- (a) live terminal recording with an API key (asciinema cast),
- (b) recording a session and exporting to static HTML for Playwright to drive,
- (c) writing pi's section from source-reading alone.

Required key for (a) / (b): `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GEMINI_API_KEY` / `GOOGLE_API_KEY`.
