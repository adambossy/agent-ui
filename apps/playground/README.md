# playground

A Vite + React dev harness for [`@adambossy/agent-ui`](../../packages/agent-ui). It
imports the library by package name (resolved to source via a Vite alias) and
demonstrates a full integration: chat surface, tool rendering, subagent
expansion, and the live-document side panel.

## Run

```bash
npm run dev                      # from the repo root — mock backend (default)
```

Two backends:

- **mock** (default) — a Vite plugin serves scripted SSE turns (`weather`,
  `parallel`, `subagent`, `todo-list`, …). No external service needed.
- **real** — proxies `/api/*` to a local [`vercel/chatbot`](https://github.com/vercel/ai-chatbot)
  template on `:3001`:

  ```bash
  VITE_BACKEND=real npm run dev -w playground
  ```

## Scripts

```bash
npm run dev        # dev server
npm run build      # tsc -b && vite build
npm run lint
npm run typecheck
```
