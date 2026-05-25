# Vercel AI Elements — Research Findings

Sources walked: docs site `https://elements.ai-sdk.dev/`, registry endpoint `https://elements.ai-sdk.dev/api/registry/`, and the shallow clone at `/Users/adambossy/code/agent_ui/vercel-ai-elements/repo/` (monorepo: `packages/cli`, `packages/elements`, `packages/shadcn-ui`, `apps/docs`). Per-component verification from `/Users/adambossy/code/agent_ui/vercel-ai-elements/repo/packages/elements/src/*.tsx`.

## 1. What it is

AI Elements is a Vercel-published, Apache-2.0 React component library for AI-native UIs (chat, agents, voice, workflow canvases, code/sandbox displays). It is explicitly built **on top of shadcn/ui** and the Vercel AI SDK — components import `UIMessage`/`ToolUIPart` from `ai` and compose shadcn primitives (Button, Collapsible, Tooltip, Card, Command, Dialog, etc.). It ships as a custom shadcn registry plus a thin npm CLI (`ai-elements`) that wraps `shadcn add`. Intent is the same as shadcn/ui: no black-box runtime package — the CLI copies source files into your repo.

## 2. Distribution model

**Copy-paste-via-CLI, shadcn-style. There is no `@vercel/ai-elements` runtime import.**

The npm package `ai-elements` (v1.9.0) is a 59-line CLI — `packages/cli/index.js` literally shells out to `shadcn@latest add <url>`. The components are served as a shadcn registry from `https://elements.ai-sdk.dev/api/registry/{name}.json`.

```bash
npx ai-elements@latest                    # install all 47 components
npx ai-elements@latest add conversation   # one component (delegates to shadcn)
# Equivalent direct call:
npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/conversation.json
```

`shadcn add` writes the `.tsx` to `<aliases.components>/ai-elements/<name>.tsx` (default `@/components/ai-elements/`), installs runtime npm deps declared in each registry entry (e.g. `conversation.json` requires `ai`, `lucide-react`, `use-stick-to-bottom`; heavier ones pull `streamdown`, `shiki`, `@xyflow/react`, `media-chrome`, `motion`, `@rive-app/react-webgl2`, `react-jsx-parser`, `tokenlens`, `katex`, `ansi-to-react`), and installs shadcn registry deps if missing.

Prereqs per docs: Node 18+, existing Next.js app, AI SDK installed, `shadcn init` already run, Tailwind in **CSS Variables mode** (hard requirement — components reference `--muted-foreground`, `--secondary`, `--ring`).

## 3. Component catalog

47 components in 4 + 1 categories, plus 169 example snippets in the registry. All verified by directory listing of `packages/elements/src/`.

**Chatbot (18):**

| Component | Purpose |
|---|---|
| `Conversation` | Stick-to-bottom scrollable container. Sub-parts: `ConversationContent`, `ConversationEmptyState`, `ConversationScrollButton`, `ConversationDownload` (+ exported `messagesToMarkdown` util). |
| `Message` | Per-turn row, user vs assistant styling, branching, actions. Sub-parts: `MessageContent`, `MessageResponse`, `MessageActions`/`MessageAction`, `MessageBranch*`, `MessageToolbar`. |
| `Reasoning` | Collapsible "thinking…" panel, auto-opens on stream, auto-closes 1s after stream ends, tracks duration. Sub-parts: `ReasoningTrigger`, `ReasoningContent`. |
| `Tool` | Collapsible call card with status badge, parameters, result/error. Consumes `ToolUIPart` / `DynamicToolUIPart`. Sub-parts: `ToolHeader`, `ToolContent`, `ToolInput`, `ToolOutput`. |
| `Attachments` | Grid/inline/list variants over `FileUIPart` / `SourceDocumentUIPart`. |
| `ChainOfThought` | Step-by-step plan with collapsible nested sections (more persistent than `Reasoning`). |
| `Checkpoint` | Named conversation snapshot pill. |
| `Confirmation` | Approve/reject HITL UI driven by tool-approval states. |
| `Context` | Token-usage progress bar (`LanguageModelUsage` + `tokenlens` pricing). |
| `InlineCitation` | Numbered ref badge + carousel hover-card. |
| `ModelSelector` | Command/dialog model picker. |
| `Plan` | Multi-card plan with collapsible step detail. |
| `PromptInput` | Composer: textarea + attachments + model dropdown + submit/stop. Uses shadcn `InputGroup`. |
| `Queue` | Pending-prompts list. |
| `Shimmer` | Loading-text shimmer (motion/react). |
| `Sources` | "Used N sources" collapsible footer. |
| `Suggestion` / `Suggestions` | Horizontal chip rail of follow-up prompts. |
| `Task` | Tool/task tree row (e.g. file search). Sub-parts: `TaskItemFile`. |

**Code (15):** `Agent` (accordion of tool descriptions), `Artifact` (Claude/v0-style side panel container), `CodeBlock` (Shiki + copy + theme), `Commit` (git stats card), `EnvironmentVariables` (masked kv table), `FileTree`, `JsxPreview` (live JSX via `react-jsx-parser`), `PackageInfo` (dep-change chips), `Sandbox` (tabbed runner consuming `ToolUIPart`), `SchemaDisplay` (HTTP schema viewer), `Snippet` (one-line copyable), `StackTrace`, `Terminal` (`ansi-to-react`), `TestResults`, `WebPreview` (iframe + URL bar).

**Voice (6):** `AudioPlayer` (media-chrome wired to `Experimental_SpeechResult`), `MicSelector`, `Persona` (Rive WebGL avatar), `SpeechInput` (Web Speech API push-to-talk), `Transcription` (time-synced over `Experimental_TranscriptionResult`), `VoiceSelector`.

**Workflow (7), all wrap `@xyflow/react`:** `Canvas`, `Node`, `Edge`, `Connection`, `Controls`, `Toolbar`, `Panel`.

**Utilities (2):** `Image` (renders AI SDK `Experimental_GeneratedImage` base64), `OpenInChat` (deep-link dropdown to ChatGPT/Claude/Grok/etc.).

## 4. Per-component anatomy

### `Conversation` — `packages/elements/src/conversation.tsx`

- **Wraps** `use-stick-to-bottom`'s `StickToBottom`. All auto-scroll logic lives there.
- **Props**: `ComponentProps<typeof StickToBottom>`, defaults `initial="smooth"`, `resize="smooth"`, `role="log"`.
- **Sub-components**:
  - `ConversationContent` — `flex flex-col gap-8 p-4`.
  - `ConversationEmptyState` — `{ title?, description?, icon?, children? }`, defaults "No messages yet" / "Start a conversation to see messages here".
  - `ConversationScrollButton` — renders only when `!isAtBottom` (from `useStickToBottomContext`); calls `scrollToBottom()`.
  - `ConversationDownload` — `{ messages: UIMessage[], filename?, formatMessage? }`. Builds Markdown via `messagesToMarkdown` (walks `message.parts`, picks `type === "text"`, joins), then triggers a Blob download.
- **HTML**: `<div role="log">` → `<div>` content → children; absolutely positioned scroll-button FAB.
- **Streaming**: doesn't parse stream events; auto-scrolls smoothly as children mount/resize, surfaces "jump to bottom" if user scrolls away.
- **Styling**: Tailwind only; uses `flex-1 overflow-y-hidden` plus shadcn `Button` outline variant for the FAB; theme via shadcn CSS variables.

### `Message` — `packages/elements/src/message.tsx`

- **Props**: `HTMLAttributes<HTMLDivElement> & { from: UIMessage["role"] }`. The `from` value is mapped to a marker class (`is-user` or `is-assistant`) on the wrapper, which drives nested `group-[.is-user]:…` Tailwind selectors.
- **Sub-components**:
  - `MessageContent` — bubble container. User: `rounded-lg bg-secondary px-4 py-3`. Assistant: plain `text-foreground` (no bubble).
  - `MessageResponse` — memoised wrapper around `Streamdown` (Vercel's incremental-Markdown renderer) with `@streamdown/{cjk,code,math,mermaid}` plugins. Memo key: `prev.children === next.children && prev.isAnimating === next.isAnimating` — partial streaming chunks are precisely what triggers re-render.
  - `MessageActions` + `MessageAction` — ghost-icon `<Button>` row, optional `tooltip` wraps in shadcn `Tooltip`.
  - `MessageBranch` + `MessageBranchContent` + `MessageBranchSelector` + `MessageBranchPrevious`/`Next` + `MessageBranchPage` — paginate alternate completions via React context, selector reads "N of M".
  - `MessageToolbar` — flex-row footer.
- **HTML**: `<div class="group … is-user|is-assistant">` → content bubble → `Streamdown` output → optional actions row.
- **Streaming**: accepts partial markdown via `MessageResponse` (forwards `isAnimating`).
- **Styling**: Tailwind utility classes; parent marker class drives variant theming. `is-user:dark` flips the bubble palette to dark regardless of page theme so user bubbles stay distinct.

### `Reasoning` — `packages/elements/src/reasoning.tsx`

- **Props**: `ComponentProps<typeof Collapsible> & { isStreaming?: boolean, open?: boolean, defaultOpen?: boolean, onOpenChange?: (open) => void, duration?: number }`. Open state via `@radix-ui/react-use-controllable-state` (controlled or uncontrolled).
- **Sub-components**:
  - `ReasoningTrigger` — props include `getThinkingMessage?: (isStreaming, duration?) => ReactNode`. Default: `<Shimmer>Thinking...</Shimmer>` while streaming, `"Thought for N seconds"` after.
  - `ReasoningContent` — `CollapsibleContent` whose `children` is typed as `string`; renders through `Streamdown` (same plugin set).
- **Streaming behaviour (explicit in source)**:
  1. On `isStreaming = true`, auto-opens unless `defaultOpen={false}` was explicitly set.
  2. Records `startTimeRef` on first tick; on stream end, sets `duration = Math.ceil((Date.now() - start)/1000)`.
  3. After streaming ends, auto-closes after `AUTO_CLOSE_DELAY = 1000ms` (one shot — won't auto-close again if user reopens).
- **HTML**: Radix Collapsible root with `[data-state=open|closed]` → trigger button (`BrainIcon`, text, rotating chevron) → animated content panel → markdown.
- **Styling**: `not-prose mb-4`, `text-muted-foreground`, `data-[state=open]:slide-in-from-top-2` / `slide-out-to-top-2` animations.

### `Tool` — `packages/elements/src/tool.tsx`

- **Props**: `ComponentProps<typeof Collapsible>`. Expects data conforming to `ToolUIPart | DynamicToolUIPart` (from `ai`).
- **Sub-components**:
  - `ToolHeader` — discriminated union: `{ type: ToolUIPart["type"], state }` (name derived from `type.split("-").slice(1).join("-")`) **or** `{ type: "dynamic-tool", state, toolName }`. Renders wrench icon, name/title, status `Badge`.
  - `ToolContent` — animated `CollapsibleContent` (slide-in/out).
  - `ToolInput` — `{ input }`. Renders "Parameters" + `<CodeBlock language="json">` of `JSON.stringify(input, null, 2)`.
  - `ToolOutput` — `{ output, errorText }`. Returns `null` if both empty. Objects → JSON `CodeBlock`. Strings → `CodeBlock`. ReactElements → rendered directly. Error styling: `bg-destructive/10 text-destructive`.
- **Status taxonomy** (hard-coded icons + labels driven by `ToolUIPart["state"]`):
  - `input-streaming` Pending · `input-available` Running (pulsing clock) · `output-available` Completed (green) · `output-error` Error (red) · `output-denied` Denied (orange) · `approval-requested` Awaiting Approval (yellow) · `approval-responded` Responded (blue).
- **HTML**: Collapsible root → trigger button (wrench + title + status badge + chevron) → content panel containing parameters block and result/error block.
- **Streaming**: state-driven, not text-streaming — re-renders as the AI SDK transitions the part through `input-streaming → input-available → output-available|error`.
- **Styling**: `rounded-md border` card, monospace via `CodeBlock`, shadcn `Badge variant="secondary"` for status.

## 5. Backing data model

The canonical message shape is **`UIMessage` from the `ai` package (AI SDK v6)**. Components import directly: `message.tsx` and `conversation.tsx` use `UIMessage`; `tool.tsx` uses `ToolUIPart`/`DynamicToolUIPart`; `attachments.tsx` uses `FileUIPart`/`SourceDocumentUIPart`; `context.tsx` uses `LanguageModelUsage`; `image.tsx` uses `Experimental_GeneratedImage`; `audio-player.tsx`/`transcription.tsx` use the experimental speech types.

A `UIMessage` is `{ role, parts: Part[] }` where `Part` is a discriminated union (`text`, `tool-<name>`, `dynamic-tool`, `source-document`, `file`, …). Components map specific part types to specific renderers — there is no global renderer dispatch.

**No global store, no `useChat` coupling.** Nothing in the elements package imports `useChat`. The README example uses `useChat()` from `@ai-sdk/react`, but the components only consume `messages` as a prop or render direct children. `@ai-sdk/react` lives in `devDependencies`, not `dependencies`, of `packages/elements/package.json`. You can feed components from any source.

## 6. Stack assumptions

- React 19.2 (per `packages/elements/package.json`).
- Tailwind CSS in **CSS Variables mode** — required.
- **shadcn/ui must be initialised first.** Every component imports from `@repo/shadcn-ui/components/ui/*` in the monorepo; when copied via the registry, those imports rewrite to your local shadcn aliases (`@/components/ui/*`).
- Next.js is the documented happy path, but technically the only Next-specific code is `"use client";` at the top of nearly every file — that directive is a no-op outside an RSC context. There is no `next/*` import anywhere in `packages/elements/src/`.
- **Not Server Components.** Nearly every component is `"use client"` (Radix portals, refs, state machines, `motion/react`, Rive WebGL, etc.). Streaming is handled client-side via `streamdown` + AI SDK part updates.

## 7. Vercel coupling

**The elements have no Vercel runtime coupling.**

- No `@vercel/*` imports in any component file.
- No telemetry, analytics, or hosted-service callbacks.
- The registry endpoint (`elements.ai-sdk.dev`) is fetched only at install time. Once components are in your repo, the endpoint is irrelevant.
- The docs *recommend* (don't require) Vercel AI Gateway via `AI_GATEWAY_API_KEY` — that's an AI SDK concern, not an Elements concern.
- Strongest coupling is via AI SDK type names (`UIMessage`, `ToolUIPart`, …) — but the AI SDK is BYO-host and works with any provider.
- License: Apache-2.0, author Hayden Bleasel @ Vercel. Freely usable.

Net: a self-hosted Vite + your-own-API stack runs AI Elements with zero Vercel infrastructure.

## 8. Independent use

**Minimum Vite + React integration:**

1. `npm create vite@latest` (React + TS), set up Tailwind, then `npx shadcn@latest init` (pick CSS Variables mode).
2. `npx shadcn@latest add https://elements.ai-sdk.dev/api/registry/conversation.json` and `…/message.json` — files land in `src/components/ai-elements/`, npm deps install automatically.
3. Wire a chat source: install `@ai-sdk/react` and use `useChat()` against your own `/api/chat`, or hand-roll a `messages` state array.
4. The `"use client"` directive is harmless in Vite (unused string literal). No further changes needed for the chatbot subset.

Caveats: `Persona` needs WebGL2 and a Rive `.riv` asset; workflow components pull `@xyflow/react` and its CSS; `Sandbox`/`WebPreview` use iframes (mind CSP).

**Non-React (Svelte/Solid/Vue):** not supported. All files are `.tsx`, every component is a React function component using React state/effects/refs/context, and many wrap Radix React primitives. There is no headless/primitive layer to reuse. Streamdown is React-only too.

## 9. Comparison to shadcn/ui

AI Elements is structurally **shadcn/ui-for-AI**: same registry mechanism, literally the same CLI underneath.

| Axis | shadcn/ui | AI Elements |
|---|---|---|
| Distribution | Custom registry + `shadcn add` | Custom registry + thin CLI delegating to `shadcn add` |
| Source ownership | Copies `.tsx` into your repo | Same |
| Runtime npm package | None | None (the `ai-elements` npm package is the CLI only) |
| Styling | Tailwind + CSS Variables | Tailwind + CSS Variables (inherits your shadcn tokens) |
| Primitive layer | Radix UI | Radix UI **via** shadcn/ui (depends on shadcn being installed; composes your `Button`, `Collapsible`, etc.) |
| Customisation | Edit the file | Edit the file |
| Theming hook | shadcn CSS variables | Same — references `--muted-foreground`, `--secondary`, `--ring`, … |
| Re-add behaviour | Overwrites | Overwrites |

Key difference: AI Elements **builds a layer above** shadcn/ui (composes shadcn primitives rather than introducing new ones) and **types are explicitly bound to the AI SDK** (`UIMessage` et al.). shadcn/ui itself is data-agnostic.

## 10. What's missing

After walking the 47 components:

- **Sidebar / conversation list** (no "list of past chats" component).
- **User avatar / identity per message** — `Persona` is an animated agent face, not a user avatar/initials chip.
- **First-class reaction/feedback affordance** — `MessageActions` is a generic icon-button row.
- **Inline edit-and-resubmit** for user messages.
- **Live token-rate / streaming-progress meter** beyond static `Context` usage bar.
- **Diff viewer** — `Commit` shows +/- stats but no side-by-side or inline diff.
- **Notifications / toast bridge** for tool errors.
- **i18n / RTL helpers** — CJK markdown plugin is wired in, but layout is LTR-only (`ml-auto` for user bubbles).
- **Built-in keyboard shortcuts** for `PromptInput` (Cmd+Enter etc. — wire your own).
- **Server-Component-friendly variants** — everything is client-side.
- **Root `UIMessage.parts` renderer dispatch** — you still write the part-type switch yourself in user code.

What's present that one might not expect: file attachments with media-category icons, human-in-the-loop tool approvals (`Confirmation`), voice I/O (`SpeechInput`, `Transcription`, `AudioPlayer`, mic/voice pickers, Rive `Persona`), a full React Flow-based workflow canvas, JSX live-preview, an ANSI terminal, a token-usage gauge with pricing via `tokenlens`, and "Open in ChatGPT/Claude/Grok" deep-links (`OpenInChat`).
