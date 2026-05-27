# earendil-works/pi-web-ui — Browser Rendering of the Agent Turn

## Headline

`@earendil-works/pi-web-ui` is a **library of Lit (mini-lit) web components** that wraps the same `@earendil-works/pi-agent-core` runtime documented for the CLI/TUI in `/Users/adambossy/code/agent_ui/pi/FINDINGS.md` and ports it to the browser. There is no git repo for this package in the parent monorepo on disk; it is consumed as a **published npm tarball only** (`package/` directory mirrors the published files). The library renders the agent's `AgentEvent` stream into a stable `MessageList` plus a dedicated streaming overlay (`StreamingMessageContainer`), persists sessions to IndexedDB, and talks to LLM providers directly from the browser with an optional CORS-proxy fallback.

Top entry points (read in this order):

- `package/src/ChatPanel.ts` — top-level component, mounts `AgentInterface` + optional `ArtifactsPanel` (`ChatPanel.ts:17-209`).
- `package/src/components/AgentInterface.ts` — subscribes to the agent, owns the scroll/auto-scroll behavior, hosts `MessageList` + `StreamingMessageContainer` + `MessageEditor` (`AgentInterface.ts:19-403`).
- `package/src/components/MessageList.ts` — **stable** list of completed messages, keyed by index (`MessageList.ts:11-93`).
- `package/src/components/StreamingMessageContainer.ts` — **single** in-flight assistant message; updates batched to `requestAnimationFrame` (`StreamingMessageContainer.ts:6-104`).
- `package/src/components/Messages.ts` — `UserMessage`, `AssistantMessage`, `ToolMessage`, `defaultConvertToLlm` (`Messages.ts:42-383`).
- `package/src/components/ThinkingBlock.ts` — collapsible reasoning block with shimmer animation (`ThinkingBlock.ts:6-43`).
- `package/src/tools/renderer-registry.ts` — `renderHeader` / `renderCollapsibleHeader` and the renderer `Map`.
- `package/src/tools/renderers/*.ts` — per-tool renderers (`BashRenderer`, `DefaultRenderer`, `CalculateRenderer`, `GetCurrentTimeRenderer`).
- `package/src/storage/backends/indexeddb-storage-backend.ts` — IndexedDB schema-driven backend (`indexeddb-storage-backend.ts:7-193`).
- `package/src/utils/proxy-utils.ts` — CORS-proxy policy (`shouldUseProxyForProvider`, `createStreamFn`) (`proxy-utils.ts:19-139`).
- `package/example/src/main.ts` — full app wiring (the example mounted at localhost:5173).

The actual `Agent` class is the same module that powers pi's TUI: `@earendil-works/pi-agent-core` (`node_modules/.../pi-agent-core/dist/agent.js:140-200`). The events it emits are `AgentEvent` (`dist/types.d.ts:354-392`), structurally identical to the CLI documented in `pi/FINDINGS.md:32-41` minus the `tool_execution_*` events being exposed but unused by the web UI (the UI reads tool state from the assistant message's `toolCall` content blocks plus the `pendingToolCalls` set instead — see "Streaming pipeline" below).

## Repo / package layout

There is no public git repo for `pi-web-ui` checked out on disk — the package is shipped via npm, and the **`package/src` directory in the tarball is the canonical source for this writeup**. The CHANGELOG (`package/CHANGELOG.md:43`) confirms the upstream lives at `github.com/badlogic/pi-mono` as part of a larger monorepo; only the published artifact is mirrored locally.

```
package/
  src/
    ChatPanel.ts                       Top-level <pi-chat-panel> + ArtifactsPanel orchestration
    index.ts                           Public exports (single barrel) — 120 lines
    app.css                            Tailwind v4 entrypoint + shimmer keyframes + user-pill style
    components/
      AgentInterface.ts                <agent-interface> — chat surface, scroll, subscription
      MessageList.ts                   Stable repeated list of all completed messages
      StreamingMessageContainer.ts     Single in-flight assistant message (rAF-batched)
      Messages.ts                      <user-message>, <assistant-message>, <tool-message>,
                                       <tool-message-debug>, <aborted-message>, defaultConvertToLlm
      ThinkingBlock.ts                 <thinking-block> — collapsible reasoning with shimmer
      MessageEditor.ts                 Textarea + paste/drop attachments + model selector trigger
      AttachmentTile.ts                Per-file preview tile (image thumb or icon + delete)
      ConsoleBlock.ts                  Monospace output panel with copy button, auto-scroll
      ExpandableSection.ts             Reusable chevron-toggled details panel
      ProviderKeyInput.ts              Provider API-key input field
      CustomProviderCard.ts            Custom provider list item
      Input.ts                         Wrapped <input>
      SandboxedIframe.ts               Sandboxed iframe for JS REPL + HTML artifacts
      message-renderer-registry.ts     registerMessageRenderer / renderMessage (by role)
      sandbox/                         Runtime providers exposed to sandboxed code:
                                         AttachmentsRuntimeProvider, ArtifactsRuntimeProvider,
                                         ConsoleRuntimeProvider, FileDownloadRuntimeProvider,
                                         RuntimeMessageBridge / Router
    tools/
      index.ts                         renderTool() — dispatch by name with showJsonMode override
      renderer-registry.ts             registerToolRenderer + renderHeader / renderCollapsibleHeader
      types.ts                         ToolRenderer + ToolRenderResult contract
      javascript-repl.ts               JavaScript REPL tool (auto-registers renderer)
      extract-document.ts              Document extractor (auto-registers renderer)
      renderers/
        BashRenderer.ts                Bash — terminal icon + console output
        DefaultRenderer.ts             Generic JSON input/output renderer (fallback)
        CalculateRenderer.ts           Calculator
        GetCurrentTimeRenderer.ts      Clock
      artifacts/
        artifacts.ts                   <artifacts-panel> + artifacts tool
        artifacts-tool-renderer.ts     Pill renderer for "artifacts" tool calls
        ArtifactElement.ts             Base for individual artifact display elements
        ArtifactPill.ts                Inline message-level "open this artifact" pill
        HtmlArtifact.ts / SvgArtifact.ts / MarkdownArtifact.ts / TextArtifact.ts /
        ImageArtifact.ts / PdfArtifact.ts / DocxArtifact.ts / ExcelArtifact.ts /
        GenericArtifact.ts / Console.ts
    dialogs/
      ApiKeyPromptDialog.ts            Polled "Add API key for <provider>" modal
      ModelSelector.ts                 Dialog with search + thinking/vision filters + keyboard nav
      SessionListDialog.ts             Past sessions, delete-on-hover
      SettingsDialog.ts                Tabbed dialog; built-in tabs: ApiKeysTab + ProxyTab
      ProvidersModelsTab.ts            Custom provider management tab
      CustomProviderDialog.ts          Add/edit custom provider
      AttachmentOverlay.ts             Full-screen attachment preview
      PersistentStorageDialog.ts       (marked broken in README:597)
    storage/
      app-storage.ts                   AppStorage singleton + global accessors
      store.ts                         abstract Store with backend pointer
      types.ts                         StorageBackend, StoreConfig, SessionData, SessionMetadata
      backends/
        indexeddb-storage-backend.ts   IndexedDB implementation, transactions, quota
      stores/
        settings-store.ts              "settings" KV
        provider-keys-store.ts         "provider-keys" KV (provider -> token)
        sessions-store.ts              "sessions" + "sessions-metadata" with lastModified index
        custom-providers-store.ts      "custom-providers" + builtin discovery types
    prompts/prompts.ts                 Tool descriptions (string constants)
    utils/
      proxy-utils.ts                   Per-provider proxy rules + createStreamFn
      attachment-utils.ts              loadAttachment(file|url|buffer) -> Attachment
      auth-token.ts                    URL-fragment auth bootstrap
      format.ts                        Token/cost formatters
      i18n.ts                          translations Map + setLanguage()
      model-discovery.ts               Ollama / LM Studio / llama.cpp / vLLM probes
      test-sessions.ts                 Dev fixtures
  example/
    src/main.ts                        Full example app with sessions + custom messages
    src/custom-messages.ts             Demonstrates declaration merging + custom renderer
    src/app.css, index.html, vite.config.ts
  dist/                                Compiled JS (371 files); peer-deps include lit 3.3
  package.json                         "@earendil-works/pi-web-ui" 0.75.3, peer mini-lit ^0.2
  README.md                            User-facing docs (600 lines)
  scripts/                             Build helpers
```

`package.json:19-30` lists runtime deps: `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui` (unused at runtime in the browser but pulled because the build ts-checks it), `@lmstudio/sdk`, `ollama`, `pdfjs-dist`, `docx-preview`, `jszip`, `xlsx`, `lucide` (icons), `typebox` (tool schemas). Peer deps (`package.json:31-34`): `@mariozechner/mini-lit ^0.2.0` and `lit ^3.3.1` — `mini-lit` supplies the `Dialog`, `Button`, `Badge`, `Switch`, `Select`, `Label`, `Alert`, `MarkdownBlock`, `code-block`, theme tokens and the Claude theme CSS (`app.css:2`).

## Streaming pipeline

End-to-end path from provider event → DOM node:

1. **Provider stream client** in `@earendil-works/pi-ai/dist/providers/{anthropic,openai-*,google,...}.js` produces an `AssistantMessageEventStream` of typed deltas (`pi-ai/dist/types.d.ts:249+`). `streamSimple` is the simple wrapper the agent calls; the web UI replaces it with `createStreamFn(...)` so a CORS proxy can rewrite `baseUrl` before delegating back to `streamSimple` (`proxy-utils.ts:127-139`).
2. **Agent loop** (`@earendil-works/pi-agent-core/dist/agent-loop.js`) processes the stream, merges deltas into a partial `AssistantMessage.content[]`, executes tools, and emits `AgentEvent`s. Public type at `pi-agent-core/dist/types.d.ts:354-392`:
   ```
   agent_start
   turn_start
   message_start    { message }
   message_update   { message, assistantMessageEvent }   <-- carries a full AgentMessage snapshot
   message_end      { message }
   tool_execution_start | tool_execution_update | tool_execution_end
   turn_end         { message, toolResults }
   agent_end        { messages }
   ```
   Critically `message_update.message` is a **full snapshot of the partial AssistantMessage**, not a delta — this matches the CLI/TUI behavior documented at `pi/FINDINGS.md:9` and lets every UI consumer always re-paint from the snapshot.
3. **Agent state** (`pi-agent-core/dist/agent.js:317,363-390`) writes the same snapshot into `state.streamingMessage` and `state.isStreaming` so non-subscriber readers (e.g. the cost line, the message editor's Send/Stop button) get the latest by re-reading state when `requestUpdate()` fires.
4. **`AgentInterface.setupSessionSubscription`** at `AgentInterface.ts:130-187` is the central wire-up. On each `AgentEvent` it:
   - `message_update`: forwards the snapshot to `_streamingContainer.setMessage(ev.message, !isStreaming)` (line 177-184).
   - `message_end`: clears the streaming container with `setMessage(null, true)` (line 162-168). The clear is immediate because the stable `MessageList` already contains the finalized message.
   - `agent_end`: clears + flips `isStreaming=false` (line 169-175).
   - `agent_start | turn_start | turn_end | message_start`: bare `requestUpdate()` — Lit reactively reads `session.state` (line 154-159).
5. **Two-track rendering.** This is the distinctive architectural choice:
   - **Stable track**: `<message-list .messages=${session.state.messages}>` (`AgentInterface.ts:278`). Renders every finalized message keyed by index via `lit/repeat` (`MessageList.ts:86-90`). For an in-flight assistant message, `MessageList` also renders it but with `hidePendingToolCalls=this.isStreaming` so tool blocks aren't duplicated against the streaming track.
   - **Streaming track**: `<streaming-message-container>` (`AgentInterface.ts:287-294`), positioned below the stable list, shown only while `state.isStreaming`. Holds one assistant message that mutates rapidly.
6. **`StreamingMessageContainer.setMessage`** (`StreamingMessageContainer.ts:28-61`) batches via `requestAnimationFrame`: stash the pending message, schedule one paint, on the next frame **deep-clone it (`JSON.parse(JSON.stringify(...))`)** so Lit detects changes in nested arrays/`toolCall.arguments` strings being mutated in place by the agent. This is the web UI's equivalent of opencode's 16 ms `batch(...)` (compare `opencode/FINDINGS.md:51-57`) — it coalesces multiple deltas into a single ~60 fps repaint. Immediate updates (clear, `message_end`) bypass batching (line 33-41).
7. **Final paint** is whichever `<assistant-message>` is on screen — both tracks instantiate the same `AssistantMessage` element. The streaming track also renders a blinking 2×4-px caret span below the message (`StreamingMessageContainer.ts:93`):
   ```html
   <span class="mx-4 inline-block w-2 h-4 bg-muted-foreground animate-pulse"></span>
   ```

`AssistantMessage.render` (`Messages.ts:104-167`) is the single source of truth for layout: iterate `message.content[]`, dispatch each chunk by `type`, append a usage footer and an error/aborted banner. Because the snapshot from `message_update` already has the full ordered content array, no part-by-part keying or component caching is needed.

## Message part / content types

Identical to the CLI's `AssistantMessage.content[]` model documented at `pi/FINDINGS.md:45-52`. From `pi-ai/dist/types.d.ts:143-191`:

```ts
TextContent      = { type: "text",      text: string, textSignature? }            // line 143
ThinkingContent  = { type: "thinking",  thinking: string, thinkingSignature?, redacted? } // line 148
ImageContent     = { type: "image",     data: string, mimeType: string }          // line 157
ToolCall         = { type: "toolCall",  id, name, arguments: Record<string,any>, thoughtSignature? } // line 162

AssistantMessage = { role: "assistant",
                     content: (TextContent | ThinkingContent | ToolCall)[],
                     api, provider, model, usage, stopReason, errorMessage?, timestamp }     // line 189
```

The web UI iterates this array exactly once per render and decides per chunk what to render (`Messages.ts:108-138`):

| `chunk.type` | Web component emitted | Notes |
| --- | --- | --- |
| `text` (non-empty after trim) | `<markdown-block .content>` | from `@mariozechner/mini-lit`; supports streaming partial markdown |
| `thinking` (non-empty after trim) | `<thinking-block>` | collapsed by default, shimmer while streaming |
| `toolCall` | `<tool-message>` | wraps the registered `ToolRenderer.render(args, result, isStreaming)` and looks up the matching `toolResult` via `toolResultsById` |
| `image` | not rendered inline in the assistant body | images appear via `UserMessage` attachments only |

The renderer-side message types are extensible via Lit declaration merging: `Messages.ts:35-40` adds `UserMessageWithAttachments` and `ArtifactMessage` to `CustomAgentMessages`, and `example/src/custom-messages.ts:21-25` shows a downstream consumer adding `system-notification`. Custom renderers go through `MessageList.renderMessage(msg)` (`MessageList.ts:44-50`), which checks the role-keyed registry **before** falling back to the built-in user/assistant components.

## Reasoning rendering

`ThinkingBlock` at `package/src/components/ThinkingBlock.ts:6-43`. Visual treatment:

- **Header row** (`ThinkingBlock.ts:32-38`): muted text "Thinking..." with a `ChevronRight` icon that rotates 90° when expanded (`rotate-90` class).
- **Streaming state** (`isStreaming=true`): the word "Thinking..." gets a Tailwind shimmer treatment by wrapping in a `bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer` (`ThinkingBlock.ts:26-28`). The keyframes are defined in `app.css:47-58`:
  ```css
  @keyframes shimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  .animate-shimmer { animation: shimmer 2s ease-in-out infinite; }
  ```
  Net effect: a 2 s gradient sweep across the "Thinking..." label while content is being produced.
- **Settled state**: shimmer class drops to `""`, leaving plain muted text.
- **Body** (`ThinkingBlock.ts:39`): hidden until clicked, then renders the raw thinking content through `<markdown-block .isThinking=${true}>` (a mini-lit hook for italics/special styling).
- **Collapse default**: `@state() private isExpanded = false` (line 10) — always starts collapsed. No persisted setting across re-mounts; toggle is purely local component state. No `Ctrl+T` shortcut (in contrast to the CLI's behavior described at `pi/FINDINGS.md:11`).
- **No title extraction.** The web UI doesn't parse a `**Title**` first line out of OpenAI-style reasoning summaries; the collapsed label is always literally "Thinking...". (Compare opencode's `reasoningTitle()` in `opencode/FINDINGS.md:109-112`.)

In the streaming track, the same `ThinkingBlock` instance receives an updated `.content` and `.isStreaming` after every deep-clone, so the shimmer keeps running uninterrupted while text grows.

## Tool call rendering

The dispatcher is `ToolMessage` at `Messages.ts:226-277`. Per assistant `toolCall` content block:

1. Look up the tool definition by name (`Messages.ts:117`): `this.tools?.find((t) => t.name === chunk.name)`.
2. Check pending-set membership: `pending = this.pendingToolCalls?.has(chunk.id)` (line 118) — `pendingToolCalls` is a `ReadonlySet<string>` exposed by the agent as `state.pendingToolCalls` (`pi-agent-core/dist/types.d.ts:300`).
3. Match the result inline: `result = this.toolResultsById?.get(chunk.id)` (line 119) — `toolResultsById` is built in `AgentInterface.renderMessages` (lines 268-274) and `MessageList.buildRenderItems` (lines 28-34) by walking the `messages[]` for `role === "toolResult"` entries.
4. Detect abort: if the assistant's `stopReason === "aborted"` and there is no result, synthesize an error result (`Messages.ts:248-257`).
5. Call the renderer registry: `renderTool(toolName, args, result, isStreaming || pending)` (`Messages.ts:258-263`).
6. Wrap or not: if `renderResult.isCustom` (`Messages.ts:266-268`), render the content bare; otherwise wrap in the card chrome (`Messages.ts:272-275`):
   ```html
   <div class="p-2.5 border border-border rounded-md bg-card text-card-foreground shadow-xs"> ... </div>
   ```

### The two-hook contract (web edition)

The web side **collapses** the CLI's `renderCall(args)` + `renderResult(result)` two-hook contract (`pi/FINDINGS.md:10`) into a **single `ToolRenderer.render(params, result, isStreaming)`** at `tools/types.ts:9-15`:

```ts
interface ToolRenderer<TParams=any, TDetails=any> {
  render(params: TParams | undefined,
         result: ToolResultMessage<TDetails> | undefined,
         isStreaming?: boolean): ToolRenderResult;
}
interface ToolRenderResult { content: TemplateResult; isCustom: boolean }
```

The renderer is responsible for branching on `(params? result? isStreaming?)` to produce four distinct visual states. Every renderer follows the same shape:

| Condition | What's shown |
| --- | --- |
| no params, no result | `renderHeader(inprogress, icon, "Waiting for <thing>...")` |
| streaming params | `renderHeader(inprogress, icon, ...)`, optional preview of partial args |
| params + no result | `renderHeader(inprogress, icon, "<doing thing>...")` with full args |
| params + result | `renderHeader(complete|error, icon, ...)` + result body |

### `renderHeader` (the shared chrome)

`tools/renderer-registry.ts:29-63`. A small flexbox row with three visual states:

- **`inprogress`**: tool icon on left in `text-foreground`, text in the middle, and a **right-aligned `Loader` icon with `animate-spin`** (Tailwind's built-in 1 s linear spin) on the right. No spacing tick; the spinner is the only animation indicator.
- **`complete`**: tool icon flipped to `text-green-600 dark:text-green-500`. Text body. No right-side affordance.
- **`error`**: tool icon flipped to `text-destructive`.

`renderCollapsibleHeader` (`renderer-registry.ts:69-130`) adds a chevron button on the right that imperatively toggles a sibling content `div`'s `max-h-0 ⇄ max-h-[2000px]` classes; used by the JS REPL renderer and the extract-document renderer to hide long output by default.

### Per-tool renderers

Built-in renderers registered automatically (`tools/index.ts:10` for `bash`; imports of `./javascript-repl.js` and `./extract-document.js` trigger their `registerToolRenderer` calls):

| Tool | File | Icon | Behavior |
| --- | --- | --- | --- |
| `bash` | `renderers/BashRenderer.ts:13-52` | `SquareTerminal` | While streaming: header "Running command..." + `<console-block .content="> <command>">`. Complete: same header (state flipped to `complete`) + console block with `> <command>\n\n<stdout>`. Error: `variant="error"` on console block. No streaming output animation — output appears at completion. |
| `calculate` | `renderers/CalculateRenderer.ts:13-58` | `Calculator` | Single-line header. Streaming: `"Calculating <expression>"`. Complete: header becomes `"<expression> = <result>"`. Error: header + destructive-colored body. |
| `get_current_time` | `renderers/GetCurrentTimeRenderer.ts:13-92` | `Clock` | Same one-line pattern. Complete: `"Getting current date and time: <output>"`. |
| `javascript_repl` | `tools/javascript-repl.ts` (auto-registered) | `Code` | `renderCollapsibleHeader` so streamed JS source/output collapses to a one-liner. |
| `extract_document` | `tools/extract-document.ts` (auto-registered) | `FileText` | `renderCollapsibleHeader`; long extracted text hidden behind chevron. |
| `artifacts` | `tools/artifacts/artifacts-tool-renderer.ts` (registered in `ChatPanel.setAgent` at `ChatPanel.ts:92-93`) | (custom) | **`isCustom: true`** — bypasses the card wrapper and renders only an `<artifact-pill>` that opens the right-side `ArtifactsPanel`. |
| anything else | `renderers/DefaultRenderer.ts:8-103` | `Code` | Generic JSON `Input:` / `Output:` panels using mini-lit `<code-block>`. Tries to `JSON.parse` the output for pretty-printing. |

A global toggle `setShowJsonMode(true)` (`tools/index.ts:21-23`) forces the `DefaultRenderer` for every tool — useful for debugging.

## Tool result rendering

Same `ToolRenderer.render(...)` call, just with a non-undefined `result` argument. The renderer chooses what to do with it. Key observations:

- **Results are matched by `toolCallId`, not by position.** `MessageList.buildRenderItems` (`MessageList.ts:28-34`) and `AgentInterface.renderMessages` (`AgentInterface.ts:268-274`) walk the message list and build a `Map<callId, ToolResultMessage>`; that map is passed to `<assistant-message>` and `<streaming-message-container>` so the **same** `<tool-message>` element transitions in place from "running" to "complete" without reordering.
- **`role: "toolResult"` messages are never rendered standalone.** Both `MessageList.buildRenderItems` (`MessageList.ts:77-79`) and `StreamingMessageContainer.render` (`StreamingMessageContainer.ts:74-77`) explicitly drop them: they only surface inline next to their originating `<assistant-message>`.
- **Result content is text-flattened** in renderers via `result.content?.filter(c => c.type === "text").map(c => c.text).join("\n")` (e.g. `BashRenderer.ts:21-24`, `DefaultRenderer.ts:28-32`). `ImageContent` blocks in tool results are not rendered by the built-in renderers.
- **Abort path.** If `assistantMessage.stopReason === "aborted"` and no result exists for a tool call, `Messages.ts:248-257` injects a synthetic `isError: true` result with empty content, causing the renderer to display its `error` state (red icon).

## Final assistant text rendering

Plain markdown:

```ts
// Messages.ts:109-110
if (chunk.type === "text" && chunk.text.trim() !== "") {
  orderedParts.push(html`<markdown-block .content=${chunk.text}></markdown-block>`);
}
```

`<markdown-block>` is `@mariozechner/mini-lit/dist/MarkdownBlock.js` (imported by side effect via `tools/artifacts/artifacts.ts:2`). It handles streaming markdown, fenced code with syntax highlighting (via mini-lit's `<code-block>`), and basic table rendering. No special "is-final" footer per message — the footer is the **usage line**:

```ts
// Messages.ts:144-149
this.message.usage && !this.isStreaming
  ? html`<div class="px-4 mt-2 text-xs text-muted-foreground ...">${formatUsage(this.message.usage)}</div>`
  : "";
```

`formatUsage` (in `utils/format.ts`) prints something like `1,234 ▲ / 567 ▼ · $0.0012`. When `onCostClick` is provided (passed from `ChatPanel` setAgent config), the line becomes a hover-able link. The web UI does **not** render the model name / agent name in the footer (compare opencode's `▣ Mode · model · duration` in `opencode/FINDINGS.md:184-187`).

Error / abort banners come after the usage line:

- `stopReason === "error"` (`Messages.ts:151-159`): `<div class="bg-destructive/10 text-destructive ...">Error: <errorMessage></div>`.
- `stopReason === "aborted"` (`Messages.ts:160-164`): inline italic destructive-colored "Request aborted".

User-side message rendering is a similar `<markdown-block>` inside a custom-styled "user pill" wrapper (`Messages.ts:55-81` and `app.css:60-69`):
```css
.user-message-container {
  background: linear-gradient(135deg, rgba(217,79,0,.12), rgba(255,107,0,.12), rgba(212,165,0,.12));
  border: 1px solid rgba(255,107,0,.25);
  backdrop-filter: blur(10px);
}
```
This produces the **orange diagonal-gradient glassy pill** that distinguishes user turns. Attachments appear below the message body as a flex-wrapped row of `<attachment-tile>` thumbnails.

## Animations / streaming visual cues

Direct catalog of every animation in the codebase:

1. **Thinking shimmer** — `app.css:47-58` keyframes + `ThinkingBlock.ts:26-28`. 2 s ease-in-out infinite linear gradient sweep across the "Thinking..." text only while `isStreaming=true`.
2. **Tool spinner** — Tailwind's `animate-spin` on `Loader` from lucide. `renderer-registry.ts:45` for the header right-side spinner; `renderer-registry.ts:120` for the collapsible-header left-side spinner. 1 s linear infinite rotation.
3. **Streaming caret** — `StreamingMessageContainer.ts:68,93` renders `<span class="mx-4 inline-block w-2 h-4 bg-muted-foreground animate-pulse"></span>`. Tailwind's `animate-pulse` is a 2 s opacity-cycle, used as a "type cursor" while streaming or before any content arrives.
4. **MessageEditor file-processing spinner** — `MessageEditor.ts:309-313`. `Loader2` icon with `animate-spin` when attaching files.
5. **Send/Stop button swap** — `MessageEditor.ts:378-399`. When `isStreaming`, the send button (rotated -45°) flips to a Square (stop) button bound to `onAbort` (which calls `agent.abort()` via `AgentInterface.render` at line 374). No animation, just a swap.
6. **Chevron rotation** — `ThinkingBlock.ts:36` `rotate-90` Tailwind transition on the chevron icon. CSS transition on `transform`.
7. **User pill** — `app.css:61` `transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1)` (used for hover/focus state changes only).
8. **Settings/dialog open** — `mini-lit` `Dialog` component handles its own fade/scale-in; `app.css:41-44` adds cursor fix for the close button.

No JS-driven RAF tick loops, no live frame buffers, no spinner-frame arrays — every animation is a CSS keyframe or transition. This is a much simpler animation surface than opencode's per-frame braille/blocks spinners (`opencode/FINDINGS.md:191-207`).

The **performance optimization** for high-frequency deltas is the `requestAnimationFrame` batch in `StreamingMessageContainer.setMessage` (`StreamingMessageContainer.ts:44-60`) plus the deep clone trick (line 52) that triggers Lit's dirty detection.

## Multi-turn / context

Storage is **IndexedDB** keyed by session id; the sidebar/list lives in a modal (`SessionListDialog`), not a permanent sidebar. The example app's flow (`example/src/main.ts`):

1. On every `agent.subscribe` event of type `state-update` (note: the example listens for `state-update`, an event emitted by `Agent._state` mutations rather than the typed `AgentEvent` union — see `example/src/main.ts:181-202`), `saveSession()` is called.
2. `saveSession` builds `SessionData` (`storage/types.ts:147-168`) + `SessionMetadata` (`types.ts:94-141`) and persists via `SessionsStore.save(data, metadata)`, which writes atomically to two object stores inside one `readwrite` transaction (`sessions-store.ts:30-35`).
3. Session id is lazily minted on first user→assistant exchange (`example/src/main.ts:192-194`) and pushed into `?session=<uuid>` (line 152-156). The URL becomes the canonical reference.
4. Loading is `loadSession(id)`: fetch `SessionData`, reconstruct an `Agent` with `messages: sessionData.messages` (line 230-236), then `ChatPanel.setAgent` calls `artifactsPanel.reconstructFromMessages(...)` to rebuild artifacts from `role: "artifact"` messages (`ChatPanel.ts:150`).
5. The **history dialog** is `SessionListDialog.open(onSelect, onDelete)` (`SessionListDialog.ts:23-29`). Listing pulls from `sessions-metadata` ordered by the `lastModified` index in descending order (`sessions-store.ts:45-48`), so newest first without a JS sort. Each row shows title, relative date ("Today" / "Yesterday" / "N days ago" / locale date — `SessionListDialog.ts:84-99`), message count, and `formatUsage(usage)`.

The sidebar **does not auto-update** during streaming — the dialog re-fetches on open via `loadSessions` (line 31-42). New turns won't appear in an already-open list. Compare opencode's binary-search-inserted live store (`opencode/FINDINGS.md:54-57`).

There is **no compaction** UI in `pi-web-ui` (no `CompactionPart`). The agent loop has `shouldStopAfterTurn` / `prepareNextTurn` hooks (`pi-agent-core/dist/types.d.ts:182-188`) that the consumer can use, but no built-in UI affordance.

## State model

Pi's web UI is intentionally **non-centralized**. Three reactive surfaces, no single store:

1. **`Agent._state`** in `@earendil-works/pi-agent-core/dist/agent.js`. The agent is an event emitter with a single `state` object. Components don't subscribe to fields; they re-read after `requestUpdate()`. Mutations (`_state.streamingMessage = ...`, `_state.messages.push(...)`) happen on `agent.js:317,363-390`. `state.messages` and `state.tools` are accessor properties so assigning a new array shallow-copies it (`pi-agent-core/dist/types.d.ts:286-290`).
2. **Lit components** subscribe via `@property` + `@state` decorators. The `AgentInterface` calls `this.requestUpdate()` after every event (`AgentInterface.ts:158-176`); Lit then diffs its template. `MessageList` is a property-driven element — passing a new `.messages` array triggers a re-render. `StreamingMessageContainer` stores the in-flight message in `@state() private _message` (`StreamingMessageContainer.ts:13`) so it re-renders independently.
3. **AppStorage singleton** — `getAppStorage()` returns a module-global instance set by `setAppStorage()` (`app-storage.ts:42-60`). Stores (`SettingsStore`, `ProviderKeysStore`, `SessionsStore`, `CustomProvidersStore`) hold a `StorageBackend` pointer set externally; they're plain async accessor classes (`store.ts:7-33`).

There is **no signal library, no reducer, no Solid store, no Redux equivalent.** The "reactive primitive" is `LitElement.requestUpdate()` plus property/state decorators. Compare this to opencode's Solid store with a typed reducer (`opencode/FINDINGS.md:52-57`).

## Direct Mode + provider wiring

The web UI is **direct mode by default** — the browser calls the LLM provider's HTTPS endpoint itself.

1. **API keys** live in IndexedDB via `ProviderKeysStore` (`stores/provider-keys-store.ts:7-33`). When the agent needs to authenticate, `Agent.getApiKey` is wired in `AgentInterface.setupSessionSubscription` (lines 146-151) to read from `getAppStorage().providerKeys.get(provider)`.
2. **Stream function**: by default `Agent.streamFn = streamSimple` (from pi-ai). The web UI overrides this in `AgentInterface.setupSessionSubscription` (lines 138-143):
   ```ts
   if (this.session.streamFn === streamSimple) {
     this.session.streamFn = createStreamFn(async () => {
       const enabled = await getAppStorage().settings.get<boolean>("proxy.enabled");
       return enabled ? (await getAppStorage().settings.get<string>("proxy.url")) || undefined : undefined;
     });
   }
   ```
3. **`createStreamFn`** (`proxy-utils.ts:127-139`) wraps `streamSimple`. On every call: read the proxy URL setting, decide whether the (provider, key) combination needs proxying, and if so rewrite `model.baseUrl` to `${proxyUrl}/?url=${encodeURIComponent(model.baseUrl)}`. Returns the proxied model to `streamSimple` and is otherwise transparent.
4. **`shouldUseProxyForProvider`** (`proxy-utils.ts:19-51`) — the policy table:

   | Provider | Proxy required? |
   | --- | --- |
   | `zai` | **always** |
   | `anthropic` | **only OAuth tokens** (`sk-ant-oat-*`) or JSON-wrapped credentials |
   | `openai-codex` | always (chatgpt.com/backend-api has no CORS) |
   | `openai`, `google`, `groq`, `openrouter`, `cerebras`, `xai`, `ollama`, `lmstudio`, `github-copilot` | no |
   | unknown providers | default no (let it work; surface CORS errors if any) |

5. **Custom providers** for Ollama / LM Studio / vLLM / llama.cpp use **autodiscovery** via the SDKs or `/v1/models` endpoint (`utils/model-discovery.ts:11-277`). LM Studio uses the official `@lmstudio/sdk` over a WebSocket (line 216) — distinctive choice; Ollama uses `ollama/browser` (line 13); the others use plain `fetch` to `/v1/models`. Discovered models are cached on the dialog and rendered alongside built-in providers in `ModelSelector` (`dialogs/ModelSelector.ts:141-186`).
6. **CORS error detection** — `isCorsError` (`proxy-utils.ts:94-118`) returns `true` for `TypeError: Failed to fetch`, `NetworkError`, or messages containing `cors`/`cross-origin`. Used by `extract-document.ts:9` to retry through the configured proxy after a failed direct fetch.

Net effect: a user can paste an Anthropic API key in the browser (`ApiKeyPromptDialog`), pick a model, and the browser talks directly to `api.anthropic.com` — no backend required. Only OAuth Anthropic tokens and Z-AI need to be proxied to bypass their CORS policies.

## Storage / persistence

`IndexedDBStorageBackend` at `storage/backends/indexeddb-storage-backend.ts:7-193`. Schema-driven:

- One IndexedDB database per app (example uses `pi-web-ui-example` at version 2 — `example/src/main.ts:50`).
- Object stores are declared at construction time via `IndexedDBConfig.stores: StoreConfig[]` (`storage/types.ts:185-194`). On `onupgradeneeded` (line 20-41), each store is created with its `keyPath` and indices.

Default schema used by the example:

| Store | KeyPath | Indices |
| --- | --- | --- |
| `settings` | (none — out-of-line keys) | — |
| `sessions` | `id` | `lastModified` |
| `sessions-metadata` | `id` | `lastModified` |
| `provider-keys` | (none) | — |
| `custom-providers` | declared by `CustomProvidersStore.getConfig()` | — |

`SessionsStore.save` (`sessions-store.ts:30-35`) writes session data + metadata atomically inside one `readwrite` transaction; reads use `getAllFromIndex("sessions-metadata", "lastModified", "desc")` (`sessions-store.ts:47`) for naturally sorted listing. Quota information goes through `navigator.storage.estimate()` (`indexeddb-storage-backend.ts:175-185`); `requestPersistence()` is wired to `navigator.storage.persist()` (line 187-192). The `PersistentStorageDialog` that would surface this to the user is marked **broken** (`README.md:597`, `example/src/main.ts:13,394-398`).

Two-store split (`sessions` + `sessions-metadata`) means listing is fast (no need to load full transcripts), and updating the title is a transactional write to both stores (`sessions-store.ts:62-75`).

API keys are **plaintext in IndexedDB**, no encryption layer (`provider-keys-store.ts:14-24`). They're scoped to the origin so cross-site reads aren't possible, but anyone with browser access can read them.

## Notable design decisions

1. **Published-only distribution.** No public git repo is mirrored on disk; everything documented above comes from the `package/src/` of the npm tarball plus the installed `node_modules`. Upstream lives in a monorepo at `badlogic/pi-mono` per CHANGELOG (`package/CHANGELOG.md:43`). This is unusual for a library this size and means there is no "fork the repo and submit a PR" path without cloning the entire monorepo.
2. **mini-lit web components with light DOM.** Every component except `ChatPanel`/`AgentInterface` is a `LitElement` whose `createRenderRoot()` returns `this`, opting out of shadow DOM (`Messages.ts:46-48,95-97,176-178,235-237`, `ThinkingBlock.ts:12-14`, `MessageList.ts:18-20`, `StreamingMessageContainer.ts:18-20`, `AgentInterface.ts:64-66`, `ConsoleBlock.ts:13-15`, etc.). This is the **opposite** of typical Lit usage. Rationale: lets Tailwind classes from `app.css` reach into every component without `::part()` or copying styles. Side effect: components inherit page CSS, which the app uses to apply the Claude theme globally.
3. **Two-track rendering.** `MessageList` is the source of truth for finalized messages; `StreamingMessageContainer` is a rAF-throttled overlay for the in-flight message. Same `<assistant-message>` element is used in both, but only the streaming track does the deep-clone trick to defeat Lit's identity comparison. The cost is ~one O(n) clone per frame for the active message; the win is that the entire finalized history doesn't re-render on every delta.
4. **Snapshot semantics throughout.** Every `message_update` carries a full `AssistantMessage` snapshot — exactly the contract from `pi/FINDINGS.md:9`. Consumers never reconstruct partial state from deltas. The deep clone in `StreamingMessageContainer.setMessage` (line 52) treats the entire snapshot as the change payload.
5. **Single `ToolRenderer.render(params, result, isStreaming)` hook.** Web UI fuses the two-hook contract of the CLI (`pi/FINDINGS.md:10`, `renderCall` + `renderResult`) into one method that branches on argument presence. Renderers are forced to handle four states (`renderHeader`'s three colors × two content shapes), but the simplification means there's no shared "state bag" between calls — each render is from scratch.
6. **Per-tool tiered chrome.** Three visual weights show through: one-line headers (`renderHeader`), collapsible headers (`renderCollapsibleHeader`), and `isCustom: true` (no chrome at all — artifacts use this). Tailwind classes; no per-tool background colors. Compare to opencode's three-color `toolPendingBg | toolSuccessBg | toolErrorBg` (`opencode/FINDINGS.md:144` and `pi/FINDINGS.md:55-62`).
7. **Direct browser → LLM provider with surgical CORS proxying.** The proxy is opt-in per-provider via `shouldUseProxyForProvider` (`proxy-utils.ts:19-51`), with the rule baked into the library — not the user's settings. Settings only flip `enabled` and `url`. Users pay no proxy hop for `openai`, `google`, `groq`, etc.
8. **Custom-element registration with idempotency guards** — `if (!customElements.get("agent-interface")) { customElements.define(...) }` (`AgentInterface.ts:401-403`, `StreamingMessageContainer.ts:101-103`, `MessageList.ts:96-98`, `ConsoleBlock.ts:69-72`). Prevents `NotSupportedError` when the library is loaded twice in the same window (e.g. browser extensions where `pi-web-ui` may ship in both the extension and a page script).
9. **Extensible message types via TypeScript declaration merging.** `Messages.ts:35-40` shows how `CustomAgentMessages` is extended for `user-with-attachments` and `artifact`; `example/src/custom-messages.ts:21-25` extends it again for `system-notification`. The custom renderer registry (`message-renderer-registry.ts:13-28`) is a `Map<role, MessageRenderer>` checked **before** built-in dispatch in `MessageList.buildRenderItems:44-50`. This is how downstream apps like Sitegeist (mentioned in README:594) add app-specific surfaces.
10. **Sandboxed iframe runtime providers.** The JS REPL and HTML artifacts execute in a sandboxed iframe with a `RuntimeMessageRouter` shuttling postMessage calls between the host and the sandbox (`components/sandbox/`). `AttachmentsRuntimeProvider` and `ArtifactsRuntimeProvider` expose typed APIs to the sandboxed code; `ArtifactsRuntimeProvider` is constructed with a `readWrite` boolean (`ChatPanel.ts:113`) so REPL tools can mutate artifacts but HTML artifacts get a read-only view.
11. **No left sidebar, no command palette, no agent-color theming.** The chrome is minimal: max-width 3xl centered column (`AgentInterface.ts:358`), modal dialogs for everything (`SessionListDialog`, `SettingsDialog`, `ModelSelector`). The header in the example app is the consumer's responsibility (`example/src/main.ts:257-340`), not the library's.
12. **Cost is the only persistent footer signal.** No agent name, mode badge, retry banner, or compaction marker. `formatUsage` shows tokens + cost; clicking it (when `onCostClick` is wired) is the only escape hatch for consumers to surface breakdowns.

## Comparison to opencode and CLI-pi findings

| Dimension | opencode (`opencode/FINDINGS.md`) | pi CLI (`pi/FINDINGS.md`) | pi-web-ui (this doc) |
| --- | --- | --- | --- |
| Render target | OpenTUI + SolidJS terminal | Custom TUI (`@earendil-works/pi-tui`) + static HTML export | mini-lit web components in browser |
| Reactive primitive | Solid fine-grained signals + Store reducer (`opencode/FINDINGS.md:52-57`) | None — class fields shadowing component handles (`pi/FINDINGS.md:18-22`) | `LitElement.requestUpdate()` + property decorators |
| Streaming semantics | **Deltas**: `message.part.delta` mutates in place; `PartUpdated` snapshot is canonical (`opencode/FINDINGS.md:55,271`) | **Snapshots**: every `message_update` is a full `AssistantMessage` (`pi/FINDINGS.md:9`) | **Snapshots**, same protocol; deep-cloned per RAF to satisfy Lit's identity check |
| Event batching | 16 ms `setTimeout` + Solid `batch()` (`opencode/FINDINGS.md:51`) | TUI render coalescing via `process.nextTick` + throttled `setTimeout` (`pi/FINDINGS.md:21`) | `requestAnimationFrame` in `StreamingMessageContainer.setMessage` |
| Tool render contract | Single Solid component per tool, switched by `tool.tool` name | Two hooks `renderCall` + `renderResult` with shared per-tool state bag (`pi/FINDINGS.md:10`) | One hook `render(params, result, isStreaming)`; no shared state between calls |
| Tool visual weight | Inline (`paddingLeft 3`) vs block (`border=["left"]` + `backgroundPanel`) (`opencode/FINDINGS.md:120-122`) | Three-color background (`toolPendingBg/Success/Error`) (`pi/FINDINGS.md:55-62`) | Card vs no-card via `isCustom`; spinner-on-right vs colored-icon-on-left |
| Reasoning | Streaming line / minimal / expanded modes, title extraction, `Ctrl+T` (`opencode/FINDINGS.md:88-112`) | Italic content type ships alongside text/tool calls; `Ctrl+T` collapse (`pi/FINDINGS.md:11`) | Single chevron toggle; always starts collapsed; 2 s shimmer text effect; no title parsing; no keyboard shortcut |
| State store | Central `sync.tsx` Solid Store with binary-search inserts + 100-message cap (`opencode/FINDINGS.md:52-57,213`) | Three-layer (`agent._state` + `AgentSession` + `InteractiveMode` fields) (`pi/FINDINGS.md:17-21`) | No central store. Stores are per-domain async accessors over IndexedDB |
| Multi-turn UX | Live scrollbox with sticky-bottom + revert/redo pill (`opencode/FINDINGS.md:212-218`) | JSONL tree with branching/forking/cloning + compaction (`pi/FINDINGS.md:23`) | IndexedDB sessions, modal list dialog, no live updates in the list, no compaction UI |
| Animations | Multiple braille/blocks spinners @ 40-80 ms ticks + 30 fps live bg (`opencode/FINDINGS.md:191-207`) | 80 ms braille spinner + per-second elapsed-timer for bash (`pi/FINDINGS.md:22`) | Pure CSS keyframes: shimmer (thinking), `animate-spin` (loader), `animate-pulse` (caret), `transition` (chevron). No JS-driven ticks. |
| Provider transport | Local AI SDK in server process | Local provider clients via `@earendil-works/pi-ai` | Same `@earendil-works/pi-ai` running in the browser; surgical CORS proxy for OAuth Anthropic and Z-AI only |
| Persistence | SQLite via Bun (`opencode/FINDINGS.md:211`) | JSONL files on disk | IndexedDB; sessions split into data + metadata stores; quota via `navigator.storage` |
| Distribution | Single open-source repo with TUI + server + Electron | Open-source repo, build with `npm run build` | **npm-published library only**; upstream monorepo `badlogic/pi-mono` |

Open questions / things not verified from source alone:

- The example app subscribes to `state-update` (`example/src/main.ts:181-202`), but the public `AgentEvent` union (`pi-agent-core/dist/types.d.ts:354-392`) doesn't declare that name. Likely a legacy event channel or an additional emitter in `Agent` — would need to read the full `pi-agent-core/dist/agent.js` to confirm.
- The README mentions an `ArtifactsPanel.tool` reachable as a property (`README.md:339-341`); how the panel constructs its tool definition and how `reconstructFromMessages` rehydrates artifacts (`ChatPanel.ts:150`) wasn't deeply traced.
- Live capture of a full assistant turn via playwriter was attempted (baseline + settings dialog screenshots saved at `/Users/adambossy/code/agent_ui/pi/screen-web-baseline.png` and `/Users/adambossy/code/agent_ui/pi/screen-web-settings.png`); per the user's note, playwriter drops messages near the end of assistant turns, so streaming behavior was verified from source rather than from a recorded run.

## Live capture

Two screenshots captured this round:

- `/Users/adambossy/code/agent_ui/pi/screen-web-baseline.png` — loaded chat UI at `localhost:5173` (empty conversation, with header + message editor + theme toggle).
- `/Users/adambossy/code/agent_ui/pi/screen-web-settings.png` — Settings dialog with Providers / Proxy tabs visible.

Streaming was **not** captured; per the user's report playwriter drops assistant messages near turn end. The streaming pipeline above is documented purely from source.
