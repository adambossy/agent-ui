# ChatGPT (chatgpt.com) — Web UI for Agent Turn Rendering

## Conditions of capture

- Logged-in free-tier account, model picker exposes a single option (`ChatGPT`); all turns landed on slug `gpt-5-5` (no GPT‑5 Thinking / o‑series available).
- 4 turns sent in a single conversation `6a1353cd-db50-83e8-8e99-0ceb8b507ffb`.
- Captured: per-turn `text/event-stream` body (49 KB to 210 KB), DOM samples at multiple offsets after Enter, screenshots saved to `/Users/adambossy/code/agent_ui/chatgpt/screens/`.

## Overall turn lifecycle (observed, 0–~7s)

| Approx t after Enter | Visible UI state |
| --- | --- |
| 0 ms | User bubble appears in transcript. |
| ~50–300 ms | Last assistant slot is an **empty placeholder** with `id="request-placeholder-request-WEB:<conv>-<n>"`. `textLen === 0`. No spinner/text rendered. |
| 300–450 ms | Placeholder is replaced by a real `[data-message-id]` element. `data-turn-start-message="true"`. Inner markdown container carries class `streaming-animation` alongside `markdown prose dark:prose-invert markdown-new-styling`. Tokens begin appearing. |
| 450 ms – end | Content streams in **place**, mutating the markdown DOM. Citations are appended inline as `<span data-testid="webpage-citation-pill">` with `animate-[show_150ms_ease-in]` (a 150 ms fade-in keyframe). |
| End | `.streaming-animation` class is removed; final-state DOM is identical except for the missing class. Turn count in sidebar updates and the conversation gets a generated title. |

No visible "Searched the web" card was rendered for web-search turns. The only outward signal of a tool call is the **inline citation pill** beside the cited sentence and the brief `request-placeholder-request-WEB:*` slot.

## Streaming protocol (SSE)

URL: `POST https://chatgpt.com/backend-api/f/conversation`
Content-Type: `text/event-stream; charset=utf-8`

Each SSE record is one block separated by `\n\n`. Records observed:

| Record | What it is |
| --- | --- |
| `event: delta_encoding` / `data: "v1"` | Version handshake. Always first. |
| `data: {"type": "resume_conversation_token", "kind": "topic", "token": "<JWT>", ...}` | Allows reattach on disconnect. JWT body contains conduit UUID, location, cluster, turn topic id. |
| `data: {"type": "input_message", "input_message": {...}, "conversation_id": "..."}` | Echo of the user message including `metadata.resolved_model_slug`, parent ID, useragent. |
| `event: delta` / `data: {"p": "", "o": "add", "v": {"message": {...}}}` | First add of an assistant or hidden-system message. Subsequent deltas use JSON-Patch ops `replace` / `append` / `patch` with `/message/...` paths. |
| `data: {"type": "message_marker", "marker": "user_visible_token", "event": "first"}` | The moment the assistant message becomes user-visible. |
| `data: {"type": "message_marker", "marker": "final_channel_token", "event": "first"}` | Final-channel content begins (vs. hidden channels). |
| `data: {"type": "search_model_queries", "queries": ["...", ...]}` | **Tool call payload** for the web-search tool. Carried inside a tool-role message: `author.role="tool", author.name="web.run"`. Multiple queries within one call run in parallel; can be followed by additional tool messages with `parent_id` chaining. |
| `data: {"type": "message_marker", "marker": "last_token", "event": "last"}` | Last token streamed. |
| `data: {"type": "stop", ...}` | Stream termination marker. |
| `data: {"type": "server_ste_metadata", "metadata": {"plan_type": "free", "model_slug": "gpt-5-5", "tool_invoked": false, "is_search": null, "search_tool_call_count": null, ...}}` | Post-turn server-side telemetry. |
| `data: {"type": "message_stream_complete", "conversation_id": "..."}` | End of HTTP stream. |
| `data: {"type": "conversation_detail_metadata", "limits_progress": [...], "default_model_slug": "auto", ...}` | Rate-limit and capability snapshot after the turn. |
| `data: {"type": "ads", ...}` / `single_advertiser_ad_unit` / `url` | Ad slots in the stream (free tier). |

### JSON-Patch delta shape

```json
{"p": "", "o": "patch", "v": [
  {"p": "/message/content/parts/0", "o": "append", "v": "\\boxed{\\$563.06}\n\\]"},
  {"p": "/message/status",          "o": "replace", "v": "finished_successfully"},
  {"p": "/message/end_turn",        "o": "replace", "v": true},
  {"p": "/message/metadata",        "o": "append",  "v": {"is_complete": true, "search_result_groups": [], "finish_details": {"type": "stop", "stop_tokens": [200002]}, "can_save": true}}
]}
```

So the client maintains an in-memory message envelope and applies a tiny patch-stream to it. Markdown is appended into `/message/content/parts/0` as a single string; the client re-tokenizes and re-renders on each append (the `streaming-animation` class triggers a blinking caret CSS animation while patches are still arriving).

## Reasoning rendering

**Not exposed on the free-tier GPT-5 (Auto) path.** The `server_ste_metadata` event explicitly reports:

```json
"did_auto_switch_to_reasoning": false,
"auto_switcher_race_winner": null,
"is_autoswitcher_enabled": false
```

No hidden reasoning channel deltas, no "Thought for Ns" expandable section, no separate reasoning DOM element appeared on any of the four turns sent. With Plus / Pro and the "Thinking" picker, the literature reports a collapsible "Thought" block; that path could not be exercised here.

## Tool-call rendering

| Surface | Where |
| --- | --- |
| **Pre-stream placeholder** | `<div id="request-placeholder-request-WEB:<conv>-<idx>">` — empty container, ~50–300 ms lifetime. The token `WEB` in the id seems hard-coded for the tool family regardless of whether web search will actually run. |
| **In-flight tool message** | Hidden from the user. SSE delta carries an assistant message with `author.role="tool"`, `author.name="web.run"`, and `metadata.search_model_queries.queries`. The base message envelope sets `metadata.is_visually_hidden_from_conversation: true`. No DOM element is created for these. |
| **Tool argument display** | None in the visible UI. Only the SSE payload exposes the queries array. |
| **Tool result rendering** | None as a standalone card. Search results are folded into the next assistant message and surface only as citation pills. |
| **Citation pill** | `<span data-testid="webpage-citation-pill" style="width: 102px;">` containing an `<a target="_blank" rel="noopener">` with class `text-token-text-secondary! bg-[#F4F4F4]! dark:bg-[#303030]!`. Width is computed per-source (truncates `max-w-[15ch]`). Animation: `animate-[show_150ms_ease-in]` (150 ms fade-in). Hover scales / color-shifts via `transition-colors duration-150 ease-in-out`. A `+1` pill on the right indicates an additional source bundled with the same citation. |
| **Entity highlight** | `<span class="hover:entity-accent entity-underline inline cursor-pointer align-baseline">` wraps recognized entities (e.g. "Microsoft", "Anthropic"). Underlined on hover, clickable, accent color on the secondary action. |

### Parallel + sequential tool calls

The 6-city / 3-stat search turn contained **two** distinct `web.run` tool messages, linked via `parent_id`:

```
turn assistant a44ce553 (hidden)
 └─ tool web.run e4ec743e — queries=[6 items: weather × 3 + population × 3]   ← parallel within
     └─ tool web.run 0c546de1 — queries=[3 items: refined weather queries]    ← sequential after
        └─ final assistant 56aed19b — the user-visible answer w/ 6 citations
```

So the agent loop runs a single tool call whose payload contains *multiple parallel sub-queries* (the model emits an array), then **chains additional tool messages sequentially** when it needs another round. The UI hides every intermediate node.

## Final assistant message rendering

```
<div data-message-author-role="assistant"
     data-message-id="…"
     data-turn-start-message="true"
     data-message-model-slug="gpt-5-5"
     class="min-h-8 text-message relative flex w-full flex-col items-end gap-2 …">
  <div class="flex w-full flex-col gap-1 empty:hidden">
    <div class="streaming-animation markdown prose dark:prose-invert wrap-break-word w-full dark markdown-new-styling">
      <!-- streamed markdown: <p>, <ul>, <li>, <code>, <span webpage-citation-pill>, <span entity-underline>… -->
    </div>
  </div>
</div>
```

- `streaming-animation` is the only outward streaming indicator; CSS attaches a blinking-caret keyframe to the trailing text node while patches keep arriving.
- Markdown sub-elements carry source-offset attributes (`data-start`, `data-end`, `data-section-id`) — these align rendered DOM to the underlying token stream, presumably so post-stream features (highlight, copy, citation hover-cards) can map back to ranges.
- Math is rendered as KaTeX-like spans with both ASCII (`47×12.99=610.53`) and LaTeX (`47 \times 12.99 = 610.53`) inline, e.g. `47×12.99=610.5347 \times 12.99 = 610.5347×12.99=610.53` — that is, the LaTeX source is co-rendered as text adjacent to the typeset form, which is a peculiarity of how the markdown extractor reads the DOM.

## Intermediary vs final assistant messages

The user never sees an "intermediary assistant" turn. The agent loop emits hidden tool-role messages and a hidden assistant scaffolding message (`is_visually_hidden_from_conversation: true`) before producing the single user-visible assistant message. The final assistant message is the only one rendered.

## Animations & microinteractions

| Element | Animation | Duration / tick |
| --- | --- | --- |
| `.streaming-animation` | Blinking-caret keyframe (CSS, while patches stream) | continuous |
| `[data-testid="webpage-citation-pill"]` | `animate-[show_150ms_ease-in]` fade-in | 150 ms |
| `.transition-colors` on pills/links | `duration-150 ease-in-out` | 150 ms |
| `.hover:entity-accent` | colour swap on entity-underline | hover |
| `:focus-visible` on assistant container | `keyboard-focused:focus-ring` | static |

No spinner/throbber/skeleton was observed on any of the four turns — the entire pre-stream interval (placeholder lifetime) is too short for one to be useful (<300 ms).

## Multi-turn behaviour

- Conversation persists at URL `/c/<conversation-id>`. Auto-titled after first user message — sidebar updated to "Node.js LTS Version" within seconds of turn 1.
- Sidebar history fetched via `GET /backend-api/conversations?offset=0&limit=28&order=updated&is_archived=false&is_starred=false` (re-fetched on each turn).
- DOM virtualisation: after 4 turns, only the last 3 assistant/user pairs were attached to the DOM at any time. Older messages were unmounted (turn 1 was no longer queryable via `[data-message-id]`). The transcript is therefore a windowed view backed by the SSE-rebuilt store; scroll position determines what's mounted.
- Stream-resume: the `resume_conversation_token` JWT (5 min TTL) lets a refreshed tab pick up an in-flight stream — `GET /backend-api/conversation/<id>/stream_status` is the polling endpoint after reload.
- Per-turn telemetry: `POST /backend-api/sentinel/{prepare,finalize,ping,req,heartbeat}` runs the anti-bot guard; `POST /backend-api/bazaar/event` and `bazaar/signal-event` fire ad/event telemetry alongside the conversation stream.

## Visual entity treatment

ChatGPT now actively underlines named entities with an "entity-accent" hover style:

```html
<span class="hover:entity-accent entity-underline inline cursor-pointer align-baseline">
  <span class="whitespace-normal">Anthropic</span>
</span>
```

Tied to the SSE `content_references` array — each match carries `type: "entity"`, `category`, `entity_data`, `id`. Some referenced types are hidden (`type: "hidden"`), notably `product`, `products`, `explore_more` — these appear to be commerce hooks left invisible on free tier.

## Page-level chrome during streaming

- No "Stop generating" button observed in DOM during the math turn's ~6 s stream — was looked up but `aria-label*="Stop"` returned nothing. (May render later in stream than the polling caught.)
- Plus button menu (`button[data-testid="composer-plus-btn"]`) exposes only: Add photos & files, Recent files, More, Projects. No "Search the web" or "Reason" toggles on the free tier.
- Quick-action chips outside the composer: `Create an image`, `Write or edit`, `Look something up` — invoke the same agent but pre-fill a prompt context.

## Notable design decisions

1. **Tool calls are completely invisible.** ChatGPT chooses to hide every `tool`-role message and to *not* render an "explainer card". The only artifact is the inline citation pill. Compare to Claude/Perplexity which surface a "Searched: ..." block during streaming.
2. **JSON-Patch deltas over plain text deltas.** Reducing wire entropy and supporting status / metadata mutations alongside text. The client only needs one patch loop, not multiple decoders.
3. **Hidden scaffold message before each assistant message.** Carries content references, citations, entities, ads — separately from the streamed text. Lets the renderer drop in citation pills, entity underlines, and ad units without changing the assistant text node mid-stream.
4. **Placeholder element with hard-coded `WEB:` prefix** even for non-web turns. Suggests the same code path renders both, with the actual tool decision happening later.
5. **DOM virtualisation of older messages.** Cuts memory for long conversations but means stitching together history requires reading the SSE or the `/textdocs` endpoint, not the DOM.
6. **Ad slots inline in the SSE stream** (`ads`, `single_advertiser_ad_unit`) — they're delivered in the same channel as the assistant content, not as a separate request.

## Artifacts

- `/Users/adambossy/code/agent_ui/chatgpt/screens/01-baseline-loggedin.png` — logged-in homepage baseline.
- `/Users/adambossy/code/agent_ui/chatgpt/screens/02-composer-ready.png` — composer focused.
- `/Users/adambossy/code/agent_ui/chatgpt/screens/03-typed.png` … `40-final-conversation.png` — turn-by-turn frames.
- `/Users/adambossy/code/agent_ui/chatgpt/sse-turn3.txt` — 50 KB of the 6-city search SSE (truncated; tool messages and `search_model_queries` events visible).
- `/Users/adambossy/code/agent_ui/chatgpt/sse-turn4-math.txt` — 17 KB full SSE for the no-tool math turn (44 deltas, 3 markers, complete envelope lifecycle).

## Open questions / gaps

- Could not observe the Thinking-model reasoning summary (no GPT-5 Thinking / o-series on free tier).
- Did not observe a "Stop generating" button mid-stream — possibly rendered briefly in a different element tree.
- Reasoning summary collapse, "Show more / Show less" expanders, and any agentic/multi-step "Tasks" UI (Sora / Operator-style) require a different model surface and were out of scope here.
