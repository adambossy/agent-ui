# ChatKit Investigation — Findings

## Headline answers

**Q1. Open source vs proprietary?** Mostly proprietary at the place that matters. The three GitHub repos are permissive-licensed (`chatkit-js` Apache-2.0, `starter` and `advanced` MIT), but:

- The npm package `@openai/chatkit@1.7.0` ships **only TypeScript type definitions** — verified by `tar -tzf chatkit-1.7.0.tgz`: contents are just `package/types/{index,widgets,dom-augment}.d.ts` + README + LICENSE. `packages/chatkit/package.json:5,7-16` confirms `"types": "./types/index.d.ts"` and no `main`/`module`.
- `@openai/chatkit-react@1.5.1` is a 6,474-byte open wrapper that registers nothing more than a `<openai-chatkit>` custom element and forwards events.
- The actual chat UI — composer, history, theming, widgets, attachments, dictation, image gen rendering, reasoning, annotations, every pixel — is **closed-source, minified, and served as an iframe from `https://cdn.platform.openai.com/deployments/chatkit/`**. The 26 KB loader at `/deployments/chatkit/chatkit.js` does `var kt=document.currentScript, Je=kt?.src||null, lt=Je && Je.replace(/\/[^/]*$/, "/"), ht="index-3RWktXtPur.html"` and points the iframe at `cdn.platform.openai.com/deployments/chatkit/index-3RWktXtPur.html` (which loads `/assets/ck1/index-RpntorzE.js`, a Vite-built React SPA). No public source for either.

The repo's own docs admit this in `chatkit-js/packages/docs/src/content/docs/index.mdx:90`: "**Who hosts the iframe that renders Chat UI? OpenAI | OpenAI**" — for **both** managed and self-hosted backends.

**Q2. Can ChatKit run completely outside OpenAI?** **No, not as shipped.** Four hard couplings:

1. The renderer is loaded from `cdn.platform.openai.com` (`chatkit-js/README.md:50-55`, `quickstart.mdx:10-16`, every `index.html` in the starter and advanced repos).
2. The iframe enforces a `domainKey` issued from `platform.openai.com/settings/organization/security/domain-allowlist` — the bundle has a `DomainVerificationRequestError` class.
3. Managed flavor mints sessions via `POST https://api.openai.com/v1/chatkit/sessions` with `Authorization: Bearer ${OPENAI_API_KEY}` + header `OpenAI-Beta: chatkit_beta=v1` (`starter/managed-chatkit/backend/app/main.py:15,52-60`).
4. Every example backend is hard-wired to `openai-agents` + `gpt-4.1-mini`; the Python `chatkit` types embed `openai.types.responses.*` directly (`advanced/examples/customer-support/backend/app/thread_item_converter.py:6-7,18-43`). `grep` for `Anthropic`/`claude`/`azure`/`OpenRouter`/`gemini` across all three repos returns **zero** hits.

Bundle capability profiles named `chatkit`, `chatgpt-shell`, `chatgpt-shell-anonymous` (visible in `/tmp/chatkit.js` as `Xe={chatkit:{allow:[...]},"chatgpt-shell":{...},"chatgpt-shell-anonymous":{...}}`) strongly suggest the same iframe app powers ChatGPT.com — ChatKit is essentially the renting of ChatGPT's UI shell behind a configuration toggle.

## Repo structures

**`chatkit-js/`** (Apache-2.0). pnpm monorepo with three workspaces: `packages/chatkit` is types-only (`types/index.d.ts` 28 KB, `types/widgets.d.ts` 11 KB, `types/dom-augment.d.ts`), `packages/chatkit-react` is a ~250-line React forwarder (`src/ChatKit.tsx`, `src/useChatKit.ts`, `src/useStableOptions.ts`, `src/index.ts`), `packages/docs` is an Astro/Starlight site. No runtime code for the actual chat UI anywhere.

**`starter/`** (MIT). Two side-by-side reference apps: `starter/chatkit/` (self-hosted: FastAPI + `openai-chatkit` Python SDK + `openai-agents`, Vite/React frontend) and `starter/managed-chatkit/` (managed: FastAPI proxy that swaps `OPENAI_API_KEY` + `wf_...` workflow id for a `client_secret`). Both UIs are 5 lines of JSX (`starter/chatkit/frontend/src/components/ChatKitPanel.tsx:13-17`).

**`advanced/`** (MIT). Four scenario demos: `cat-lounge` (widgets, client effects, image gen), `customer-support` (attachments, dictation, action handlers, title agent), `news-guide` (@mentions, tool menu, progress events), `metro-map` (React Flow + annotations, custom header actions). All use `openai-chatkit` + `openai-agents` with `gpt-4.1-mini`.

## Distribution model

| Artifact | Contents | Where |
| --- | --- | --- |
| `@openai/chatkit@1.7.0` npm | TypeScript `.d.ts` only, **no runtime** | npm |
| `@openai/chatkit-react@1.5.1` npm | 6.5 KB compiled wrapper around `<openai-chatkit>` custom element | npm |
| `chatkit.js` loader | 26 KB minified bundle that defines the custom element + iframe glue. **Source not public.** | `cdn.platform.openai.com/deployments/chatkit/chatkit.js` |
| Actual ChatKit UI | Vite-built React SPA (~MB) inside an iframe; HTML at `index-3RWktXtPur.html`, JS at `/assets/ck1/index-RpntorzE.js`, CSS at `/assets/ck1/index-DZ5eN2wS.css`. **Source not public.** | `cdn.platform.openai.com/deployments/chatkit/` (Cloudflare → Azure blob) |

The iframe HTML (mirrored at `/tmp/chatkit_iframe.html`) contains a revealing self-comment: `⚠️ Anything added here that triggers network requests to non-customer origins ... must be stripped in vite.config.ts (transformIndexHtml) when VITE_DISABLE_NON_CUSTOMER_NETWORK_REQUESTS=true.` — i.e., OpenAI builds it internally as a Vite app with a build-flag-controlled "no external network" mode.

## External / proprietary dependencies

Hosts contacted by any ChatKit-embedding page out of the box:

- `cdn.platform.openai.com` — hosts `chatkit.js` and the iframe app + assets.
- `api.openai.com` — managed path only: `POST /v1/chatkit/sessions` with `OpenAI-Beta: chatkit_beta=v1` (undocumented beta endpoint).
- `cdn.openai.com` — OpenAI Sans webfonts (cosmetic, optional).
- `platform.openai.com` — only documentation + domain allowlist UI.

Iframe details: the web component creates `<iframe class="ck-iframe" name="chatkit" allow="clipboard-read; clipboard-write; ..." frameborder="0" scrolling="no">` and communicates via `window.postMessage` with messages stamped `__oaiChatKit: !0`. The bundle exposes 11 commands (`command.fetchUpdates`, `command.focusComposer`, `command.hideHistory`, `command.sendCustomAction`, `command.sendUserMessage`, `command.setComposerValue`, `command.setOptions`, `command.setThreadId`, `command.setTrainingOptOut`, `command.shareThread`, `command.showHistory`) and ~20 event types (`event.deeplink`, `event.effect`, `event.error`, `event.history.{open,close}`, `event.image.download`, `event.log`, `event.log.chatgpt`, `event.message.share`, `event.ready`, `event.response.{start,end,stop}`, `event.thread.{change,load.start,load.end,restore}`, `event.tool.change`, `event.toast.{show,hide}`, `event.composer.{layout.change,submit}`). Notice `event.log.chatgpt` — telemetry is at minimum architected for.

## Architecture

**Component model.** One web component: `<openai-chatkit>`. The React layer (`packages/chatkit-react/src/ChatKit.tsx:38-107`) renders that custom element, calls `el.setOptions(control.options)` after `customElements.whenDefined('openai-chatkit')` resolves, and wires every event through `EVENT_HANDLER_MAP`. `useChatKit` (`useChatKit.ts:13-22, 58-108`) exposes the 8 imperative methods `focusComposer`, `setThreadId`, `sendUserMessage`, `setComposerValue`, `fetchUpdates`, `sendCustomAction`, `showHistory`, `hideHistory`.

**Message/data model.** Thread item types (extracted from the bundle): `assistant_message`, `client_tool_call`, `end_of_turn`, `generated_image`, `image_generation`, `structured_input`, `task`, `user_message`, `widget`, `workflow`. Public types: `UserMessageContent` = `input_text | input_tag` (`types/index.d.ts:610-622`); `Attachment` = `file | image` server-uploaded ids (`types/index.d.ts:448-468`); `Entity` for @-mentions (`types/index.d.ts:570-598`); a full **widget DSL of ~25 components** (`types/widgets.d.ts:1-598`): `Card`, `ListView`/`ListViewItem`, `Box`/`Row`/`Col`, `Form`, `Markdown`, `Title`, `Caption`, `Text`, `Badge`, `Icon`, `Image`, `Button`, `Input`, `Textarea`, `Select`, `DatePicker`, `RadioGroup`, `Checkbox`, `Label`, `Table`/`Table.Row`/`Table.Cell`, `Divider`, `Spacer`, `Transition`. Widgets are server-authored JSON, client-rendered.

**Streaming protocol.** SSE over a single HTTPS endpoint (`POST /chatkit`, `starter/chatkit/backend/app/main.py:25-35`, returns `text/event-stream` when result is `StreamingResult`). **Not** Chat Completions delta and **not** raw Responses API — it's ChatKit's own thread-event protocol (`ThreadItemDoneEvent`, `ThreadItemReplacedEvent`, `ProgressUpdateEvent`, `ClientEffectEvent`, `ThreadItemUpdated`, `WidgetRootUpdated`). However, it is **layered on the Responses API**: `chatkit.agents.stream_agent_response` converts `openai-agents` Runner output (which emits Responses API events) into ChatKit events (`advanced/examples/cat-lounge/backend/app/server.py:110-113`). The Python `chatkit.types` re-exports `openai.types.responses.ResponseInputContentParam`, `ResponseInputImageParam`, `ResponseInputTextParam` directly.

**Tool model.** Three categories: **(1) Server tools** — Python `@function_tool`s on the `openai-agents` `Agent`; the model invokes them server-side and the server streams back `WidgetItem`, `AssistantMessageItem`, `ProgressUpdateEvent`, `HiddenContextItem`, or `ClientEffectEvent`. Full example in `advanced/examples/cat-lounge/backend/app/cat_agent.py:129-402`. **(2) Client tools** — handled in the browser via `onClientTool` (`types/index.d.ts:57-60`), result streamed back to the model. Example: `metro-map`'s `get_selected_stations` reads React Flow canvas state. **(3) Client effects** — fire-and-forget server→browser messages (`ClientEffectEvent`), handled in React `onEffect` (`advanced/examples/cat-lounge/frontend/src/components/ChatKitPanel.tsx:86-103`). Composer can also surface a tool menu (`composer.tools`, `types/index.d.ts:316-321, 524-557`) and a model picker (`composer.models`, `types/index.d.ts:327-328, 680-695`), passing through as `tool_choice`/`model` on the request.

**Reasoning, tool-call, tool-result, assistant-text rendering.** All rendering happens inside the closed iframe, so I can only describe the protocol surface:

- **Assistant text** → `thread.item.assistant_message` containing `AssistantMessageContent[]` (`AssistantMessageContent(text="…")`, e.g. `cat_agent.py:217-220`). Streamed from Responses API text deltas; rendered as markdown.
- **Reasoning / "thinking"** → `thread.item.task`. The Python SDK has no public `TaskItem` builder in any example; these items are emitted automatically by `stream_agent_response` when the underlying Agents SDK surfaces a Responses-API reasoning summary. There is no `Reasoning` or `Thought` type in the public surface (`grep -r "Reasoning\|Thought"` returned nothing in examples).
- **Multi-step plans** → `thread.item.workflow`. Same: emitted by the converter, not constructed by hand in examples.
- **Tool calls and tool results** — server tools render via their visible artifact (a widget, an assistant message, a `ProgressUpdateEvent`); raw tool call/result JSON is not rendered as such. Client tools render as `thread.item.client_tool_call` (a disclosure card). Image generation renders as `thread.item.image_generation` with progressive `thread.item.generated_image` frames; `ResponseStreamConverter(partial_images=3)` controls partial streaming (`cat-lounge/backend/app/server.py:110-112`).
- **Annotations / entity sources** — assistant messages carry inline entity references rendered as clickable chips; `metro-map`'s `plan_route` attaches stations as entity sources, and `entities.onClick` lets you handle clicks client-side.
- **End of turn** → `thread.item.end_of_turn`, surfaced as `chatkit.response.end` (`types/index.d.ts:1158`).

**Multi-turn behaviour.** Thread state is server-authoritative. Frontend only persists `threadId` via `onThreadChange`. Backend implements `chatkit.store.Store[Context]` — `load_thread`, `save_thread`, `load_threads`, `load_thread_items`, `add_thread_item`, `save_item`, `load_item`, `delete_thread`, `delete_thread_item`, `save_attachment`, `load_attachment`, `delete_attachment` (`starter/chatkit/backend/app/memory_store.py:14-115`). The starter ships an in-memory store; production apps swap in their own DB.

## Auth and provider switching

Two auth modes (`types/index.d.ts:697-732`):

- `CustomApiConfig = { url, domainKey, fetch?, uploadStrategy? }` (self-hosted) — `api.url` can be any URL; cookie/header auth between browser and your `/chatkit` endpoint is your problem (inject via custom `fetch`). `domain_pk_localhost_dev` is the universal local placeholder; production requires registering your domain at `platform.openai.com`.
- `HostedApiConfig = { getClientSecret }` (managed) — Your server calls `api.openai.com/v1/chatkit/sessions` with `OPENAI_API_KEY` + workflow id to mint a `client_secret`; the iframe authenticates each request with that secret (`starter/managed-chatkit/frontend/src/lib/chatkitSession.ts:12-40`, `starter/managed-chatkit/backend/app/main.py:36-93`).

There is **no ChatGPT user token concept**. Authentication is between your app and OpenAI's API + iframe; ChatGPT.com login is not involved. But the `domain_pk_...` is permanently tied to a platform.openai.com organization.

**Can the endpoint be changed?** Yes for `CustomApiConfig.url`, but the iframe is still loaded from `cdn.platform.openai.com` and the `domainKey` is still enforced. **Can the OpenAI key be swapped for Anthropic/Azure/OpenRouter?** Not without writing a custom `ChatKitServer.respond()` from scratch — every example targets `openai-agents` + `gpt-4.1-mini`, and `chatkit.types` is implemented in terms of `openai.types.responses.*`. The SSE protocol is in principle provider-agnostic, so a determined developer could yield ChatKit events from any source, but you would re-implement the converter, lose image-gen partial streaming, lose reasoning-summary support, lose the Agent Builder workflow runtime — and still hit OpenAI's CDN + domain allowlist.

## Run notes — starter app

Per `starter/chatkit/README.md` and `starter/chatkit/backend/scripts/run.sh`:

1. `npm install` in `starter/chatkit/` — succeeded (25 packages; root only installs `concurrently`).
2. `npm install` in `starter/chatkit/frontend/` — succeeded (177 packages; Vite 7, React 19, `@openai/chatkit-react@^1.1.1`; 10 audit warnings, all transitive).
3. `scripts/run.sh` refuses to start without `OPENAI_API_KEY` (`scripts/run.sh:33-36`: `if [ -z "${OPENAI_API_KEY:-}" ]; then ... exit 1; fi`). Stopped here per task instructions; wrote `/Users/adambossy/code/agent_ui/chatkit-js/BLOCKERS.md`.

Required env vars: `OPENAI_API_KEY` (required, backend), `VITE_CHATKIT_API_URL` (optional, defaults `/chatkit`), `VITE_CHATKIT_API_DOMAIN_KEY` (optional, defaults `domain_pk_localhost_dev`). Managed flavor additionally needs `VITE_CHATKIT_WORKFLOW_ID=wf_...`.

## Comparison

**vs. Vercel AI SDK + AI Elements.** Different category. AI SDK ships full open source under MIT (every line of `useChat`, `<Thread>`, tool-call renderer, markdown renderer) and is **provider-agnostic** (`openai`, `anthropic`, `google`, `groq`, `mistral`, …). ChatKit ships a `.d.ts` file and an instruction to `<script src="https://cdn.platform.openai.com/...">`. The runtime is a black box on OpenAI's CDN, hard-bound to OpenAI's stack (CDN, domain allowlist, Responses API types, Agents SDK). AI SDK has no server-authored widget DSL; you build your own React. ChatKit gives you a rich widget protocol — but only ChatKit's renderer can render it.

**vs. ChatGPT.com.** ChatKit and ChatGPT.com appear to share the same underlying renderer — the bundle's capability profiles literally name `chatkit`, `chatgpt-shell`, `chatgpt-shell-anonymous`. ChatGPT.com is a ChatKit consumer where the profile enables additional commands (`command.shareThread`, `event.thread.restore`, `event.message.share`, `event.image.download`, `command.setTrainingOptOut`). For end users this means ChatKit integrations will feel exactly like ChatGPT, because they are the same renderer. For developers it means **you are renting a UI OpenAI controls end-to-end** — they ship updates to your users without you redeploying, but you cannot patch a bug, customize a render path, audit DOM behavior, fork to add a feature, host a stable older version, or run an air-gapped deployment.

## Key source pointers

- License situation: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/LICENSE` (Apache 2.0), `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/NOTICE`, `/Users/adambossy/code/agent_ui/chatkit-js/starter/LICENSE` (MIT), `/Users/adambossy/code/agent_ui/chatkit-js/advanced/LICENSE` (MIT).
- npm is types-only: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/chatkit/package.json:5,7-16`.
- React wrapper source: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/chatkit-react/src/{ChatKit.tsx,useChatKit.ts,useStableOptions.ts,index.ts}`.
- CDN loader (mirror): `/tmp/chatkit.js` (`https://cdn.platform.openai.com/deployments/chatkit/chatkit.js`).
- Iframe HTML (mirror): `/tmp/chatkit_iframe.html` (`https://cdn.platform.openai.com/deployments/chatkit/index-3RWktXtPur.html`).
- "OpenAI hosts the iframe" admission: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/docs/src/content/docs/index.mdx:90`.
- Mandatory script tag: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/docs/src/content/docs/quickstart.mdx:10-16` plus all six `index.html`s in the starter and advanced repos.
- `ChatKitOptions`: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/chatkit/types/index.d.ts:9-125`.
- API config types: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/chatkit/types/index.d.ts:697-732`.
- Widget DSL: `/Users/adambossy/code/agent_ui/chatkit-js/chatkit-js/packages/chatkit/types/widgets.d.ts`.
- Managed session mint (proof of OpenAI coupling): `/Users/adambossy/code/agent_ui/chatkit-js/starter/managed-chatkit/backend/app/main.py:15,52-60`.
- Self-hosted backend example: `/Users/adambossy/code/agent_ui/chatkit-js/starter/chatkit/backend/app/{main.py,server.py,memory_store.py}`.
- Full-featured server example with action handlers / attachments / dictation: `/Users/adambossy/code/agent_ui/chatkit-js/advanced/examples/customer-support/backend/app/server.py`.
- Cat lounge agent (widgets, client effects, image generation): `/Users/adambossy/code/agent_ui/chatkit-js/advanced/examples/cat-lounge/backend/app/cat_agent.py`.
- OpenAI Responses-API tie-in: `/Users/adambossy/code/agent_ui/chatkit-js/advanced/examples/customer-support/backend/app/thread_item_converter.py:6-7,18-43`.
