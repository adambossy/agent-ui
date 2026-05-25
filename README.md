# agent_ui

Research, planning, and a working prototype for a web UI that drives an AI agent
backend.

## Layout

```
.
├── app/                     Vite + React + TS prototype
│                              (chat surface, mock backend, real-backend connector)
├── report/                  HTML research report covering six agent UIs
│                              (ChatGPT, sst/opencode, earendil-works/pi,
│                               OpenAI ChatKit, Vercel Chat SDK, AI Elements)
├── plan/                    SmartPlan tree for implementing the web UI
│                              against `agent_harness` over the AI SDK protocol
├── notes/                   Implementation references
│                              (resumable streams, etc.)
├── chatgpt/                 Per-target research findings
├── opencode/                  ”
├── pi/                        ”
├── chatkit-js/                ”
├── vercel-chat-sdk/           ”
└── vercel-ai-elements/        ”
```

## Quickstart

```bash
cd app
npm install
npm run dev                       # mock backend (default)
# or
VITE_BACKEND=real npm run dev     # talks to a local vercel/chatbot template
```

See `report/index.html` for the research overview, `plan/index.html` for the
implementation plan, and `app/src/` for the prototype source.
