# Server status

**No server is running, and none can be.** Pi is a terminal UI (TUI) — it does not expose an HTTP port or any browser-reachable surface. See `BLOCKERS.md` for the full explanation.

What we did instead:
- Cloned to `/Users/adambossy/code/agent_ui/pi/repo`.
- `npm install --ignore-scripts` — succeeded (348 packages, 0 vulnerabilities).
- `npm run build` — succeeded; produced `packages/coding-agent/dist/cli.js`.

Available runtime entry points (none is a web server):
| Command | Surface | Browser-reachable? |
|---|---|---|
| `./pi-test.sh` (interactive) | Raw-mode TTY TUI | No |
| `./pi-test.sh -p "prompt"` | Stdout text | No |
| `./pi-test.sh --mode json` | JSONL events on stdout | No |
| `./pi-test.sh --mode rpc` | JSONL RPC over stdin/stdout | No |
| `./pi-test.sh --export session.jsonl out.html` | Writes a self-contained static HTML replay | Yes (file:// URL) |

If the follow-up phase wants to use Playwright, the **only** viable target is the `--export` static HTML replay (option (b) in `BLOCKERS.md`), and it requires a pre-recorded session JSONL — which in turn requires an LLM API key to produce.
