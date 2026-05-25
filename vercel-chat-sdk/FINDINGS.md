# Vercel Chat SDK / Chatbot Template — Research Findings

> **Naming note.** Vercel ships *two* things sometimes called "Chat SDK":
> 1. `chat-sdk.dev` / `github.com/vercel/chat` — a multi-platform *bot* SDK (Slack/Teams/Discord). **Not** what this research is about.
> 2. `chatbot.ai-sdk.dev` / `github.com/vercel/chatbot` (formerly `vercel/ai-chatbot`) — the AI chatbot **template** on the Vercel AI SDK. Its docs site used to live at `chat-sdk.dev` and the project is colloquially "the Chat SDK." All findings below are about #2.
>
> Underlying SDK: `github.com/vercel/ai` (npm: `ai`, `@ai-sdk/react`, providers).
> AI Elements (shadcn-style UI registry): `https://elements.ai-sdk.dev/`.
> Cloned the template (depth 1) to `/Users/adambossy/code/agent_ui/vercel-chat-sdk/repo/` (package.json shows version `3.1.0`).

---

## 1. What it is

"Chatbot" is a free, open-source **Next.js application template** — *not a library you `npm install`* — that demonstrates how to build a production-grade ChatGPT-style web app on top of Vercel's AI SDK (`ai` + `@ai-sdk/react`). It ships streaming chat UI, multi-model selection via AI Gateway, message persistence, Auth.js login, file uploads, generative-UI "artifacts" (text/code/image/sheet docs that open in a side panel), tool-call rendering with human-in-the-loop approval, reasoning-token rendering, and resumable streams. README at `/Users/adambossy/code/agent_ui/vercel-chat-sdk/repo/README.md:6-8` calls it "a free, open-source template built with Next.js and the AI SDK." So **"Chat SDK" is really a reference implementation + a constellation of reusable libraries** (`ai`, `@ai-sdk/react`, `streamdown`, AI Elements, `resumable-stream`). No top-level `chat-sdk` npm package wraps it.

## 2. Distribution

**Both a template (the main artifact) and a set of npm libraries (the substrate).** Key deps from `package.json:20-86`:

| Package | Version | Role |
|---|---|---|
| `ai` | `6.0.116` | Core: `streamText`, `createUIMessageStream`, `tool`, `UIMessageStreamWriter`, `UIMessage`, `convertToModelMessages`, `gateway`. Framework-agnostic. |
| `@ai-sdk/react` | `3.0.118` | `useChat`, `UseChatHelpers`, `DefaultChatTransport`, `addToolApprovalResponse`. |
| `@ai-sdk/provider` | `^3.0.3` | Base LM-provider interfaces. |
| `streamdown` + `@streamdown/{code,math,mermaid,cjk}` | `^2.3.0` | Streaming-safe markdown renderer. |
| `resumable-stream` | `^2.2.10` | Redis-backed SSE resume (OSS). |
| `next` | `16.2.0`; `next-auth` `5.0.0-beta.25` | Template-only. |
| `drizzle-orm` + `postgres` | Postgres DB layer. |
| `@vercel/blob`, `@vercel/functions`, `@vercel/otel`, `@vercel/analytics`, `botid` | Vercel-specific touchpoints. |

UI primitives come from **AI Elements** — a shadcn-style copy-paste registry; the template vendors them into `components/ai-elements/*.tsx`.

## 3. Stack assumptions

**The template is Next.js-only. The libraries underneath are not.** Template requires Next.js 16 App Router, React 19, Server Components + Server Actions, Node runtime route handlers, a Next "middleware" (renamed `proxy.ts:1-52`), Tailwind 4, shadcn, Radix, pnpm. **Streaming primitive: HTTP Server-Sent Events** carrying the AI SDK's *UI Message Stream protocol v1*. The custom marker header is `x-vercel-ai-ui-message-stream: v1` (renamed from the older `x-vercel-ai-data-stream`) — it's parsed by `@ai-sdk/react` client-side and is **not** a Vercel-platform protocol. The underlying `ai` + `@ai-sdk/react` packages support Next, plain React (Vite/CRA/Remix), Svelte, Vue, Angular, and Node.

## 4. UI message model

Canonical: `UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools>` from `ai`. Template wires it at `/Users/adambossy/code/agent_ui/vercel-chat-sdk/repo/lib/types.ts:10-49`:

```ts
export type ChatTools = {
  getWeather: InferUITool<typeof getWeather>;
  createDocument: InferUITool<ReturnType<typeof createDocument>>;
  updateDocument: InferUITool<ReturnType<typeof updateDocument>>;
  requestSuggestions: InferUITool<ReturnType<typeof requestSuggestions>>;
};
export type CustomUIDataTypes = {
  textDelta: string; imageDelta: string; sheetDelta: string; codeDelta: string;
  suggestion: Suggestion; appendMessage: string;
  id: string; title: string; kind: ArtifactKind;
  clear: null; finish: null; "chat-title": string;
};
export type ChatMessage = UIMessage<MessageMetadata, CustomUIDataTypes, ChatTools>;
```

Each message has `id`, `role`, and a **`parts: UIMessagePart[]` array** (the old `content` string was removed in the v1.1.10 migration; see DB rename to `Message_v2` at `lib/db/schema.ts:42-52`). Part taxonomy observed in `components/chat/message.tsx:46-303`:

| Part `type` | Notes |
|---|---|
| `"text"` | `{ text }` |
| `"reasoning"` | `{ text, state? }` |
| `"tool-<toolName>"` | One per static tool; carries `toolCallId`, `state`, `input`, `output`, optional `approval` |
| `"dynamic-tool"` | Untyped tools |
| `"file"` | `{ filename, mediaType, url }` attachments |
| `"source-url"` / `"source-document"` | Citations |
| `"step-start"` / `"step-finish"` | Multi-step agent boundaries |
| `"data-<key>"` | Custom channels; here: `data-textDelta`, `data-codeDelta`, `data-imageDelta`, `data-sheetDelta`, `data-id`, `data-title`, `data-kind`, `data-clear`, `data-finish`, `data-suggestion`, `data-chat-title` |

`Attachment` is a separate `{ name, url, contentType }` type for the input composer (`lib/types.ts:51-55`).

## 5. Reasoning

Just another part type. Server toggles emission via `result.toUIMessageStream({ sendReasoning: isReasoningModel })` (`app/(chat)/api/chat/route.ts:243`). Client merges all `reasoning` parts of a message (`message.tsx:84-114`) and renders through `MessageReasoning → Reasoning` from AI Elements. The `<Reasoning>` primitive (`components/ai-elements/reasoning.tsx:58-149`) is a Radix Collapsible with: auto-open while `isStreaming`, duration tracking ("Thought for N seconds"), auto-close 1s after streaming ends, `<Streamdown>` body. **Yes — Chat SDK ships built-in collapsible reasoning components.**

## 6. Tool calls

Modeled as `tool-<name>` parts with a fixed state machine (`components/ai-elements/tool.tsx:48-66`): `"approval-requested" | "approval-responded" | "input-streaming" | "input-available" | "output-available" | "output-denied" | "output-error"`. Generic `<Tool>` / `<ToolHeader>` / `<ToolInput>` / `<ToolOutput>` (Radix Collapsible + JSON code-block) are provided, but the template **overrides per-tool** — e.g. `tool-getWeather` renders a custom `<Weather>` card on `output-available` and an Allow/Deny prompt on `approval-requested` (`message.tsx:131-218`); `tool-createDocument` renders a `<DocumentPreview>`. Tool-approval is built into the AI SDK: `needsApproval: true` on tool definition pauses execution; client calls `addToolApprovalResponse({ id, approved, reason? })` from `useChat`; `useChat` is configured with `sendAutomaticallyWhen` to auto-continue on approve (`hooks/use-active-chat.tsx:113-153`).

## 7. Streaming

**AI SDK UI Message Stream protocol over HTTP SSE.** Frames are `data:` lines terminated by `data: [DONE]`. The protocol-version header is `x-vercel-ai-ui-message-stream: v1` (a content-type marker only — not a Vercel-runtime requirement). Event types: `start`/`finish`/`abort`/`error`, `start-step`/`finish-step`, `text-start`/`text-delta`/`text-end`, `reasoning-start`/`reasoning-delta`/`reasoning-end`, `source-url`/`source-document`, `file`, `tool-input-start`/`tool-input-delta`/`tool-input-available`/`tool-output-available` (plus approval states), and `data-<key>` custom channels.

Server entry (`app/(chat)/api/chat/route.ts:191-244, 307-327`):
```ts
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({ model, messages, tools, … });
    writer.merge(result.toUIMessageStream({ sendReasoning }));
    writer.write({ type: "data-chat-title", data: title });
  },
});
return createUIMessageStreamResponse({ stream, consumeSseStream });
```
Client: `useChat({ transport: new DefaultChatTransport({ api: "/api/chat", … }) })`. A separate `data-*` channel feeds artifact updates via `DataStreamHandler` (`components/chat/data-stream-handler.tsx:11-91`). **Resumable streams** (`route.ts:50-58, 307-326`, `lib/db/schema.ts:120-136`) use the `resumable-stream` npm package, Redis (`REDIS_URL`/`KV_URL`), a `Stream` Postgres row, and Next's `after()` to keep the route alive past response close — fully OSS, not Vercel-locked.

## 8. Persistence

**Ships a full DB layer; required, not pluggable behind an interface.** Postgres via `postgres` driver + Drizzle ORM (`lib/db/queries.ts:36-37`). Schema (`lib/db/schema.ts`): `User`, `Chat`, `Message_v2 (parts json)`, `Vote_v2`, `Document`, `Suggestion`, `Stream`. Drizzle migrations run at build (`"build": "tsx lib/db/migrate && next build"`). README suggests Neon, but any Postgres works. File storage uses `@vercel/blob`'s `put()` (`app/(chat)/api/files/upload/route.ts:1, 52-55`) — Vercel-locked unless swapped. Replacing Postgres = rewrite `queries.ts`; replacing Blob = rewrite the upload route.

## 9. Auth

**Auth.js v5 (NextAuth) is hard-wired.** `app/(auth)/auth.ts:1-99` configures two `Credentials` providers (email-password + guest); `proxy.ts` redirects unauth'd users to `/api/auth/guest` to mint a guest JWT. Every server entrypoint calls `auth()` and 401s on null session. Tool factories and document handlers take `session: Session` from `next-auth` by type (`lib/artifacts/server.ts:22`), so swapping auth means rewriting types in ~6 files.

## 10. Artifacts

**Side-panel "documents" the model can create/edit during a conversation.** Four kinds ship: `text`, `code`, `image`, `sheet` (`lib/artifacts/server.ts:99`, `components/chat/artifact.tsx:32-38`). Flow: model calls `createDocument`/`updateDocument` tool → handler emits `data-id`/`data-title`/`data-kind` parts then delegates to a per-kind `DocumentHandler` (`lib/artifacts/server.ts:35-91`) → handler streams content via `streamText` and writes per-kind deltas (e.g. text artifact emits `{ type: "data-textDelta", data: chunk, transient: true }` at `artifacts/text/server.ts:22-26`) → client `DataStreamHandler` routes deltas to the matching artifact's `onStreamPart` → on `data-finish`, content is persisted to a versioned `Document` table (PK `(id, createdAt)`). The `<Artifact>` panel (`components/chat/artifact.tsx`) renders a 60%-width side pane with ProseMirror text editor, CodeMirror code editor, `react-data-grid` sheets, version history with diff, and a toolbar. Extension point is the `Artifact<Kind, Metadata>` class in `components/chat/create-artifact.tsx`.

## 11. Vercel coupling — the critical question

Three layers, very different stories:

- **`ai` + `@ai-sdk/react` + `@ai-sdk/*` providers:** **effectively zero Vercel coupling.** Pure TS. Runs on Node/Deno/Bun/CF Workers/browser. SSE is standard `Response` streams.
- **AI Gateway** (`gateway.languageModel(modelId)` in `lib/ai/providers.ts:1-23`): off-Vercel works with `AI_GATEWAY_API_KEY`; one-line swap to direct providers (`openai`, `anthropic`, ...).
- **The template itself** — itemised Vercel touchpoints:

| Surface | Vercel code | Required? | Effort to replace |
|---|---|---|---|
| File uploads | `put` from `@vercel/blob` (`app/(chat)/api/files/upload/route.ts:1,52-55`) | If you keep uploads | Swap for S3/R2/Supabase — ~20 LOC |
| Geo + IP | `geolocation`, `ipAddress` from `@vercel/functions` (`route.ts:1,87,159`) | For system-prompt hints + rate-limit | Read `x-forwarded-for` headers — trivial |
| BotID | `withBotId`/`checkBotId` from `botid` (`next.config.ts:1,54`, `route.ts:10,75`) | Only meaningful on Vercel (Kasada) | Delete or swap for Turnstile — trivial |
| OTel | `@vercel/otel` `registerOTel` (`instrumentation.ts:1-5`) | Optional | Vanilla `@opentelemetry/sdk-node` |
| Analytics | `@vercel/analytics` | Optional | Delete import |
| `after()` (resume) | `import { after } from "next/server"` (`route.ts:11`) | Required for resumable streams | Use platform `waitUntil` |
| AI Gateway OIDC | Automatic on Vercel | Optional | Use `AI_GATEWAY_API_KEY` or direct providers |
| Streaming protocol | `x-vercel-ai-ui-message-stream: v1` | Just a content-type marker | None — works anywhere |
| `vercel.json` | `{ "framework": "nextjs" }` only | Not required | Delete |

**Nothing in the streaming wire protocol requires Vercel hosting.** The header is purely a marker the client lib reads. Can it run on Cloudflare / Render / a VM? **Yes** — a Node VM/Render/Fly/Railway needs the ~5 single-line swaps above. CF Workers needs a Next.js Pages adapter for middleware/image; the API route's `createUIMessageStream` + `createUIMessageStreamResponse` return a standard `Response` with a streaming body and is Workers-compatible.

## 12. Independent-use viability

Three options for non-Next.js stacks:

**Option 1 (recommended) — Skip the template; use `ai` + `@ai-sdk/react` directly.** ~80% of what makes Chat SDK feel powerful is `useChat`, `createUIMessageStream`, `streamText`, plus AI Elements components — none Next- or Vercel-bound:
```ts
// server (Hono/Express/Workers):
const stream = createUIMessageStream({ execute: ({ writer }) => {
  const r = streamText({ model: openai("gpt-4o"), messages: convertToModelMessages(messages) });
  writer.merge(r.toUIMessageStream({ sendReasoning: true }));
}});
return createUIMessageStreamResponse({ stream });
```
```tsx
// client (Vite + React):
const { messages, sendMessage, addToolApprovalResponse, status } =
  useChat({ transport: new DefaultChatTransport({ api: "/api/chat" }) });
```
Then copy the AI Elements components you want (`Conversation`, `Message`, `Reasoning`, `Tool`, `PromptInput`) — pure React + Radix + Tailwind + shadcn.

**Option 2 — Lift specific modules from the template.** Highest-value pieces:
- Artifact panel system (`components/chat/artifact.tsx`, `data-stream-handler.tsx`, `lib/artifacts/server.ts`, `artifacts/*/{client,server}.ts`) — 1 file per kind, only `next/navigation` to swap.
- Tool-approval wiring (`hooks/use-active-chat.tsx:113-153` + `addToolApprovalResponse` rendering in `message.tsx`).
- Resumable streams (Redis + `resumable-stream` + `Stream` table).
- Reasoning auto-collapse (`components/ai-elements/reasoning.tsx`).

**Option 3 — Run the template as-is, elsewhere.** Clone, remove the 5 Vercel touchpoints, point `POSTGRES_URL`/`REDIS_URL` anywhere, set `AI_GATEWAY_API_KEY` or swap providers. ~half a day for someone fluent in Next.

**Recommendation:** for a non-Next.js stack, **Option 1 wins by a wide margin.** The "Chat SDK" is really the AI SDK + a Next demo; install `ai` + `@ai-sdk/react`, copy the AI Elements components you need, write a ~25-line API handler, skip `next-auth`, Drizzle, and the rest of the template's opinions. Lift the artifact/tool-approval/reasoning modules (Option 2) only if you specifically want those UX patterns — they're the genuinely novel pieces.
