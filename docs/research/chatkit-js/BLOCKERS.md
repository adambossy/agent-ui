# ChatKit starter run: blocker

Per `starter/chatkit/README.md` (lines 19-26) and `starter/chatkit/backend/scripts/run.sh` (lines 33-36), the **self-hosted** ChatKit starter requires `OPENAI_API_KEY` to be set in the environment (or in `.env.local`) before the FastAPI backend will start. The startup script exits with `exit 1` if the var is missing:

```bash
if [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "Set OPENAI_API_KEY in your environment or in .env.local before running this script."
  exit 1
fi
```

The agent (`starter/chatkit/backend/app/server.py:17,20-28`) is hard-wired to OpenAI: it uses the `openai-agents` Python SDK with `model = "gpt-4.1-mini"` — no provider abstraction, no Anthropic/Azure/OpenRouter switch.

The **managed** flavor (`starter/managed-chatkit/backend/app/main.py:36-60`) also requires `OPENAI_API_KEY` plus a `VITE_CHATKIT_WORKFLOW_ID` (a `wf_...` id created in OpenAI Agent Builder), and it POSTs to `https://api.openai.com/v1/chatkit/sessions` with header `OpenAI-Beta: chatkit_beta=v1` to mint a `client_secret`. Cannot run at all without OpenAI credentials.

`npm install` worked fine in both `starter/chatkit` and `starter/chatkit/frontend` (177 packages, 0 install errors). The frontend will also `<script src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js">` and embed an iframe from `cdn.platform.openai.com`, so even with a key the chat UI itself is loaded from OpenAI's CDN.

**Action**: user can supply an OPENAI_API_KEY to launch and watch it work, but the experiment of "running ChatKit fully without OpenAI" is structurally impossible as shipped — see `FINDINGS.md`.
