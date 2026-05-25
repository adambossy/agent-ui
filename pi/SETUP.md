# Setup: running earendil-works/pi locally

> **Important**: pi is a terminal UI, not a web app. The instructions below get you a working `pi` CLI. There is no browser-reachable surface (see `BLOCKERS.md`). If you need an HTML artifact for the browser phase, use the `--export` flow at the end.

## Prerequisites
- Node.js >= 22.19 (`engines.node` in root `package.json`). Repo was tested with `v24.15.0`.
- npm 11+ (tested with `11.12.1`).

## Clone & build

```bash
git clone --depth 1 https://github.com/earendil-works/pi.git /Users/adambossy/code/agent_ui/pi/repo
cd /Users/adambossy/code/agent_ui/pi/repo
npm install --ignore-scripts        # 348 packages
npm run build                       # builds tui -> ai -> agent -> coding-agent
```

Both commands completed without errors in this environment.

## Run pi from the source tree

`pi-test.sh` is the repo-provided wrapper that runs the built CLI from any cwd:

```bash
./pi-test.sh --help                        # CLI reference
./pi-test.sh                               # interactive TUI (needs a real TTY + key)
./pi-test.sh -p "say hi"                   # one-shot text
./pi-test.sh --mode json -p "say hi"       # one-shot, JSONL events on stdout
./pi-test.sh --mode rpc                    # full RPC over stdin/stdout
```

## Required credentials

Pi requires an LLM provider credential. The **default provider is google** (no `--provider` -> Gemini). Override via flags or env vars:

| Provider | Env var | CLI |
|---|---|---|
| Anthropic | `ANTHROPIC_API_KEY` | `--provider anthropic --model sonnet` |
| OpenAI | `OPENAI_API_KEY` | `--provider openai --model gpt-4o` |
| Google (default) | `GEMINI_API_KEY` or `GOOGLE_API_KEY` | (no flags) |

OAuth subscriptions also work via `/login` inside the interactive TUI (Anthropic Pro/Max, OpenAI Plus/Pro/Codex, GitHub Copilot).

No `.env.example` is shipped; pi reads env vars directly at startup.

## Optional: avoid network calls during startup

```bash
export PI_OFFLINE=1                  # disables version check + install telemetry
export PI_SKIP_VERSION_CHECK=1       # disables version check only
```

## Producing a browser-renderable artifact (the `--export` flow)

If the follow-up Playwright phase needs a browser surface, this is the only path. It requires a previously recorded session JSONL.

1. Run a real interactive session with a valid API key. Sessions auto-save to `~/.pi/agent/sessions/<cwd-hash>/<uuid>.jsonl`.
   ```bash
   export ANTHROPIC_API_KEY=sk-ant-...
   ./pi-test.sh --provider anthropic --model sonnet
   # ...drive a turn or two, then /quit
   ```
2. Find the session file (`./pi-test.sh -r` lists recent sessions; `/session` inside pi prints the absolute path).
3. Export to HTML:
   ```bash
   ./pi-test.sh --export ~/.pi/agent/sessions/.../<uuid>.jsonl /tmp/pi-session.html
   ```
4. Open `file:///tmp/pi-session.html` in a browser (or Playwright). The HTML is a single self-contained file with embedded session data, `marked.js`, and `highlight.js`. It reproduces the same theme and message structure as the TUI but is a static replay (no live streaming, no input).

## Useful flags for capturing a session

- `--no-session` — ephemeral, don't write to disk (skip if you need to export afterwards).
- `--thinking high` — force visible thinking blocks so the report can show reasoning rendering.
- `--mode json` — capture the full event stream for analysis without driving a TTY.

## Source layout you may want to point at later

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts` — TUI driver, ~5560 lines, owns the event handler that maps `AgentEvent`s to component updates.
- `packages/coding-agent/src/modes/interactive/components/` — all message/tool/loader components.
- `packages/coding-agent/src/core/tools/` — per-tool `renderCall` / `renderResult` definitions.
- `packages/coding-agent/src/core/export-html/{template.html,template.css,template.js}` — the static HTML export.
- `packages/agent/src/types.ts` — `AgentEvent` discriminated union (canonical wire protocol).
- `packages/ai/src/types.ts` — `AssistantMessage`, `AssistantMessageEvent` (provider-level stream protocol).
