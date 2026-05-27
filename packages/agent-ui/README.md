# @adambossy/agent-ui

React components and a live-component runtime for building agent chat UIs:
streaming messages, reasoning, tool-call rendering, subagent expansion, and a
side-panel "live document" system driven by server-streamed ops.

> Backend-agnostic. The library renders UI and manages client state; you supply
> the transport (e.g. the Vercel AI SDK's `useChat`) and wire its data parts to
> the stores. The [playground](../../apps/playground) is a complete reference
> integration.

## Install

The package is currently private. Within this monorepo it resolves through the
workspace; external consumers can use a git dependency or `npm pack`.

```ts
import {
  Message,
  Composer,
  LiveDocsPanel,
  useLiveDocStore,
  useLiveUIStore,
  useSubagentStore,
  registerLiveComponent,
  registerToolRenderer,
} from "@adambossy/agent-ui";
import type { UIMessage, LiveOpEvent } from "@adambossy/agent-ui";
```

## Styles (Tailwind v4)

The library is styled with Tailwind v4 utilities plus a small set of design
tokens and custom classes. Consumers process the shipped stylesheet through
their own Tailwind build:

```css
@import "tailwindcss";
@import "@adambossy/agent-ui/styles.css";

/* Let Tailwind generate the utility classes the components use: */
@source "../node_modules/@adambossy/agent-ui/dist";
```

## Public API

- **Components** — `Message`, `Composer`, `Markdown`, `Reasoning`
- **Tool renderers** — `registerToolRenderer`, `resolveToolRenderer`,
  `markAsSubagent`, `isSubagentTool`
- **Subagent store** — `useSubagentStore`, `useSubagent`
- **Live-component runtime** — `registerLiveComponent`, `LiveComponentHost`,
  `LiveDocsPanel`, `useLiveDocStore`, `useLiveUIStore`, `LiveOpClient`,
  `zodCodec`, and the live-op protocol types
- **Types** — `UIMessage`, `UIMessagePart*`, `LiveOpEvent`,
  `LiveComponentManifest`, `LiveRendererProps`, `SubagentEvent`, …

Anything not re-exported from the package root is internal and may change
without notice.

## Build

```bash
npm run build      # tsup -> dist/{index.js, index.d.ts, styles.css}
npm run typecheck
```
