# Blockers for browser-driven walkthrough of earendil-works/pi

## Top-level blocker: pi has no web UI

The repo (`https://github.com/earendil-works/pi.git`) is a **terminal UI / CLI agent harness**, not a web application. There is no web server, no React/Vue/Svelte frontend, no HTML page to navigate to. The follow-up phase that was supposed to drive the UI with Playwright **cannot proceed as planned** because there is nothing to point a browser at.

Concrete evidence:
- `README.md` (line 19): "Pi Agent Harness Mono Repo" — packages are `pi-coding-agent` (CLI), `pi-agent-core` (runtime), `pi-ai` (LLM client), `pi-tui` (terminal UI library).
- `packages/coding-agent/README.md` line 20: "Pi is a minimal terminal coding harness."
- The four runtime modes are: interactive TUI, `--print` (one-shot text), `--mode json` (JSONL events on stdout), `--mode rpc` (JSONL RPC over stdin/stdout). None of these is a browser UI.
- `find . -name "vite.config*" -o -name "next.config*" -o -name "svelte.config*"` returned **zero** results.
- The only HTML in the repo (`packages/coding-agent/src/core/export-html/template.html`) is a **static export** of an already-recorded session to a single self-contained HTML file via `pi --export <session.jsonl>`. It is not a live UI: it loads pre-baked `SESSION_DATA` JSON and renders it. No server, no streaming, no input.

## API-key requirement (relevant if you choose to fall back to recording a TUI session)

Pi requires an LLM provider credential before it can serve traffic. From `packages/coding-agent/README.md` lines 82-94:

```
export ANTHROPIC_API_KEY=sk-ant-...
pi
```

or interactive `/login` OAuth (Anthropic Pro/Max, OpenAI Plus/Pro/Codex, GitHub Copilot subscription flows).

There is no `.env.example` in the repo; pi reads provider env vars directly. The default provider is **google** (`packages/coding-agent/src/cli.ts` default for `--provider`), so absent flags, pi will look for `GEMINI_API_KEY` / `GOOGLE_API_KEY`. No keys were attempted; none would have produced a web UI either way.

## What to ask the user

1. **Choose a fallback approach for the comparison report**, since there is no live web UI to screenshot:
   - **(a) Asciinema / terminal recording**: run pi in a real terminal and capture screen frames of an actual agent turn. We can drive it via the `--mode rpc` JSONL protocol from outside the terminal but still need a TTY to see the rendered TUI output.
   - **(b) Static `--export` HTML**: generate one or more session JSONL files and use `pi --export session.jsonl out.html` to produce a faithful HTML rendering. The follow-up Playwright phase can open that file. This **is** representable in a browser, but it is a post-hoc replay, not an interactive UI.
   - **(c) Skip the browser walkthrough for pi**: write the comparison from source-code reading alone (this finding doc already covers all rendering stages with file:line citations).
2. If (a) or (b), provide one of:
   - `ANTHROPIC_API_KEY` (for Claude), or
   - `OPENAI_API_KEY` (for GPT models), or
   - `GEMINI_API_KEY` / `GOOGLE_API_KEY` (for the default Google provider).
   We tried no keys; pi would not have launched into a usable session without one.

## What we observed when trying to start

We did **not** attempt `pi` because there is no server to start; the per-step instructions said to skip server start if a key was required. `npm install --ignore-scripts` (348 packages) and `npm run build` both completed cleanly. The built CLI is at `packages/coding-agent/dist/cli.js`, runnable via `./pi-test.sh ...` from any cwd.
