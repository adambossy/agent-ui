# agent-ui

A React UI for driving AI agents — shipped as a library, [`@adambossy/agent-ui`](./packages/agent-ui),
that deploy-owning projects import. This repo is a workspace monorepo: the
library plus a dev playground that exercises it, alongside the research and
planning that informed the design.

```
.
├── packages/
│   └── agent-ui/      # The library (@adambossy/agent-ui): chat components + live-component runtime
├── apps/
│   └── playground/    # Vite dev harness — mock backend + a real-backend connector
└── docs/
    ├── research/      # Findings on agent UIs (ChatGPT, opencode, pi, ChatKit, Vercel Chat SDK, AI Elements, …)
    ├── plans/         # SmartPlan implementation trees (web-ui, live-components)
    └── notes/         # Implementation references (resumable streams, live-components design)
```

## Quickstart

```bash
npm install              # installs all workspaces

npm run dev              # run the playground against the mock backend
npm run build            # build the library (@adambossy/agent-ui)
npm run build:playground # type-check + bundle the playground
npm run lint             # lint all workspaces
npm run typecheck        # type-check all workspaces
```

The playground resolves `@adambossy/agent-ui` to the library **source** via a Vite
alias, so edits to the library show up immediately — no build step needed during
development.

## Using the library

`@adambossy/agent-ui` is currently private (not published). Consume it via the
workspace, a git dependency, or `npm pack`. See the
[package README](./packages/agent-ui/README.md) for the API surface, the
Tailwind/styles setup, and integration notes.

## License

[MIT](./LICENSE)
