# Resumable streams — implementation reference

How the Vercel AI SDK / Chat SDK template makes a streaming chat response survive a disconnect / reload. Recorded for future reference; evidence pulled from the live walkthrough on 2026-05-24.

## Architecture at a glance

```
                ┌─────────────────┐
                │ Browser         │
client (1)──POST│ /api/chat       │
                │  ↓ stream body  │
                │ ────────────────│
                │  ↑ stream body  │   (a) chat tab dies / refresh
                │   x  disconnect │
                └─────────────────┘

                ┌─────────────────────────────────────────────┐
                │ Next route handler                          │
                │  • run streamText / createUIMessageStream   │
                │  • return resp; ALSO keep alive via after() │   ← Next's after()
                │  • tee SSE bytes → Redis pub/sub key        │     keeps the route
                │                                             │     handle running
                │            after()─────────┐                │     after the response
                │                            ↓                │     has closed.
                │              ┌──────────────────────┐       │
                │              │ resumable-stream     │       │
                │              │ writes to Redis      │       │
                │              └──────────────────────┘       │
                └─────────────────────────────────────────────┘
                                            ↓
                                     ┌────────────┐
                                     │  Redis     │  (pub/sub key per streamId,
                                     └────────────┘   value = the SSE byte log)
                                            ↑
                                            │
client (2)──GET / resumeStream() ───────────┘   (b) reload, useAutoResume fires
                                                    if last message is user role
```

Two pieces:

1. **`resumable-stream`** — server-side npm package, MIT, also from Vercel. Wraps any `ReadableStream` so a later GET can re-attach to it via a `streamId`.
2. **`@ai-sdk/react` `useChat`** — exposes `resumeStream()` as a first-class action. Reads the same protocol marker (`x-vercel-ai-ui-message-stream: v1`) on the GET response.

The core `ai` package does *not* ship a resume primitive itself. It's the two siblings above that make it work.

## Server side

### Package

```jsonc
// package.json
"resumable-stream": "^2.2.10"
```

Re-export entry: `createResumableStreamContext`.

### Bootstrap (memoised context with a `waitUntil`)

`app/(chat)/api/chat/route.ts:11-18`:

```ts
import { after } from "next/server";
import { createResumableStreamContext } from "resumable-stream";

function getStreamContext() {
  try {
    return createResumableStreamContext({ waitUntil: after });
  } catch (_) {
    return null;
  }
}
```

`waitUntil` is the only platform hook. On Vercel: Next's `after()`. On Cloudflare Workers: `ctx.waitUntil`. On a long-running Node server (Fly / Render / VM): you don't need it (the process keeps running anyway) — pass a no-op `() => {}` or just rely on the process.

### Tee the response stream to Redis

`app/(chat)/api/chat/route.ts:307-326`:

```ts
return createUIMessageStreamResponse({
  stream,                            // the AI SDK UI Message Stream
  async consumeSseStream({ stream: sseStream }) {
    if (!process.env.REDIS_URL) return;       // hard guard — silently no-op
    try {
      const streamContext = getStreamContext();
      if (streamContext) {
        const streamId = generateId();
        await createStreamId({ streamId, chatId: id });          // Postgres index row
        await streamContext.createNewResumableStream(
          streamId,
          () => sseStream                                        // ← tee target
        );
      }
    } catch (_) { /* non-critical */ }
  },
});
```

Important: `consumeSseStream` is an AI-SDK hook that fires after the response has been handed to the client. The `() => sseStream` callback is what `resumable-stream` reads bytes from and copies into Redis. Because of `after()`, the route handler keeps living past the response, draining the stream into Redis after the client connection closes.

### GET handler — replay from Redis

The template's `app/(chat)/api/chat/[id]/stream/route.ts` (or a similar resume endpoint) looks up the latest `streamId` for the chat and calls:

```ts
const stream = await streamContext.resumableStream(streamId, makeEmptyStream);
return new Response(stream, {
  headers: {
    "Content-Type": "text/event-stream",
    "x-vercel-ai-ui-message-stream": "v1",      // ← AI SDK v1 marker, required
  },
});
```

`makeEmptyStream` is the fallback if Redis has nothing — usually a `[DONE]`-only stream so the client cleanly exits resume mode.

### Postgres index table

`lib/db/schema.ts:120-136`:

```ts
export const stream = pgTable(
  "Stream",
  {
    id: uuid("id").notNull().defaultRandom(),
    chatId: uuid("chatId").notNull().references(() => chat.id),
    createdAt: timestamp("createdAt").notNull(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.id, t.chatId] }) }),
);
```

Used only as an index: "give me the latest streamId for chatId X." The actual byte log lives in Redis.

## Client side

### `useChat` exposes `resumeStream`

`@ai-sdk/react`'s `useChat` hook returns it alongside `messages`, `sendMessage`, etc.:

```ts
const { messages, sendMessage, resumeStream, setMessages } = useChat({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
});
```

`resumeStream()` fires a GET to `<api>/<chatId>/stream` (template's convention), receives the `text/event-stream` body with the `v1` marker, and re-uses the same parser that handles initial streams.

### Auto-resume on mount

`hooks/use-auto-resume.ts`:

```ts
export function useAutoResume({
  autoResume,
  initialMessages,
  resumeStream,
  setMessages,
}) {
  useEffect(() => {
    if (!autoResume) return;
    const mostRecentMessage = initialMessages.at(-1);
    if (mostRecentMessage?.role === "user") {
      resumeStream();      // last persisted message is user → assistant was in flight
    }
  }, [autoResume, initialMessages.at, resumeStream]);
  // …data-stream merge handlers omitted
}
```

The trigger heuristic — "last persisted message is `role === "user"`" — is the cheapest reliable signal that a stream was in flight when the tab died. If the assistant finished, its `role === "assistant"` row would be at the tail.

### Wired into `useChat` via `hooks/use-active-chat.tsx`

`hooks/use-active-chat.tsx:107, 233` destructures `resumeStream` from `useChat`'s return and threads it to `useAutoResume`. There is no extra ceremony — the AI SDK's hook just has resume as a built-in action.

## Storage layout

Two stores, distinct purposes:

| Store    | What                                    | Lifetime |
| -------- | --------------------------------------- | -------- |
| Postgres `Stream` row | `(streamId, chatId, createdAt)` index | Forever (until chat is deleted) |
| Redis pub/sub key     | Raw SSE byte log keyed by `streamId`   | TTL'd (default ~few minutes by `resumable-stream`) |

The Postgres row is the lookup index; Redis is the actual stream cache. If Redis evicts the key before the client reconnects, the resume is a clean no-op (returns the `makeEmptyStream` fallback).

## Requirements checklist

To enable on a non-Vercel host:

- [ ] **Redis** with pub/sub. Any vanilla Redis works. Upstash and Vercel KV are drop-in (same protocol).
  - Local: `docker run -d -p 6379:6379 redis:7-alpine`
  - Env: `REDIS_URL=redis://localhost:6379`
- [ ] **`waitUntil` equivalent** — the resumable-stream context needs a way to keep a task alive past the HTTP response close.
  - Vercel: Next's `after()` (already there).
  - Cloudflare Workers: `ctx.waitUntil`.
  - Long-running Node (Fly / Render / VM / Docker): no-op — the process just keeps running and the stream completes naturally. Pass `() => {}`.
- [ ] **Persistence index** — a way to look up "latest streamId for this chat." The template uses a Postgres `Stream` table; any KV would do.
- [ ] **GET resume endpoint** — same protocol as the POST, returning a stream of the same `v1` marker, calling `streamContext.resumableStream(streamId, ...)`.

## Disabled-by-default on my running setup

The Chat SDK template I started on `localhost:3001` has resumable streams **disabled** because I didn't set `REDIS_URL`. The guard `if (!process.env.REDIS_URL) return;` in `consumeSseStream` short-circuits and the response stream is never tee'd. If the browser tab dies mid-stream right now, the work is lost (LLM call continues server-side but the bytes are dropped on the floor).

To enable: `docker run -d -p 6379:6379 redis:7-alpine` + `echo "REDIS_URL=redis://localhost:6379" >> .env` + restart `npm run dev`.

## Porting to a Python backend

The `resumable-stream` package is just a server-side ReadableStream wrapper around a pub/sub key. A Python equivalent is straightforward:

```python
import asyncio, json
import redis.asyncio as redis
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()
r = redis.from_url("redis://localhost:6379")

async def tee_to_redis(stream_id: str, gen):
    """Write SSE bytes to a Redis list keyed by stream_id while also yielding to client."""
    async for chunk in gen:
        await r.rpush(f"stream:{stream_id}", chunk)
        yield chunk
    await r.rpush(f"stream:{stream_id}", "__DONE__")
    await r.expire(f"stream:{stream_id}", 300)   # 5-minute TTL like resumable-stream

@app.post("/chat")
async def chat(body: dict):
    stream_id = generate_id()
    save_stream_index(body["chat_id"], stream_id)     # Postgres

    async def gen():
        async for ev in run_agent_and_emit_sse(body):
            yield ev

    return StreamingResponse(
        tee_to_redis(stream_id, gen()),
        media_type="text/event-stream",
        headers={"x-vercel-ai-ui-message-stream": "v1"},
    )

@app.get("/chat/{chat_id}/stream")
async def resume(chat_id: str):
    stream_id = get_latest_stream_id(chat_id)
    async def replay():
        # If you want pure replay: read existing list contents
        existing = await r.lrange(f"stream:{stream_id}", 0, -1)
        for chunk in existing:
            if chunk == b"__DONE__":
                yield "data: [DONE]\n\n"
                return
            yield chunk.decode()
        # Then subscribe for new chunks (a pubsub channel, or poll the list length)
        # ... (left out for brevity)
    return StreamingResponse(
        replay(), media_type="text/event-stream",
        headers={"x-vercel-ai-ui-message-stream": "v1"},
    )
```

Two gotchas:

1. **The keepalive after disconnect.** Python's `StreamingResponse` cancels the generator when the client disconnects. To keep producing into Redis past disconnect, kick off the LLM consumption in a background `asyncio.create_task` that writes to Redis, and have the response generator subscribe to the Redis side. That way the LLM keeps streaming → Redis even when the client drops; the resume GET then replays everything from Redis.

2. **Single-source-of-truth.** Decide whether the response stream is the producer (and Redis is a tee) or whether Redis is the producer (and the response is a subscriber). The Vercel implementation uses the latter pattern internally — `createNewResumableStream` is the producer, the client response is just a subscriber that happens to be the first one. That eliminates the disconnect race entirely.

## Key file citations (Chat SDK template)

| Concern | File:line |
| ------- | --------- |
| Stream context factory | `app/(chat)/api/chat/route.ts:11-18` |
| Tee callback / stream-id creation | `app/(chat)/api/chat/route.ts:307-326` |
| Postgres index row | `lib/db/schema.ts:120-136` |
| GET resume endpoint pattern | (template's `app/(chat)/api/chat/[id]/stream/route.ts` — same `streamContext.resumableStream(streamId, makeEmptyStream)` pattern) |
| Auto-resume hook | `hooks/use-auto-resume.ts:11-33` |
| `resumeStream` thread-through | `hooks/use-active-chat.tsx:107, 233` |

## Open questions for later

- How does `resumable-stream` handle multiple concurrent subscribers to the same `streamId`? (Useful if two tabs open the same chat.)
- What's the Redis TTL it sets by default? Worth checking before relying on it for long-running sessions.
- Does `useChat` deduplicate events on resume so a partially-rendered message doesn't double up? (Likely yes via message ids — verify if it ever matters.)
