# Contributing

## Setup

```bash
npm install     # Node >= 20; installs all workspaces
```

## Layout

- `packages/agent-ui` — the published library. Keep its public surface in
  `src/index.ts`; anything not re-exported there is internal.
- `apps/playground` — dev harness. Imports the library by its package name
  (`@adambossy/agent-ui`), resolved to source via a Vite alias.
- `docs/` — research, plans, and notes. Not shipped.

## Workflow

```bash
npm run dev          # playground against the mock backend
npm run typecheck    # all workspaces
npm run lint         # all workspaces
npm run build        # build the library
```

## Guidelines

- Library code stays backend-agnostic: no hardcoded API URLs, no build-time
  defines. Pass configuration in as props/arguments.
- New exports go through `packages/agent-ui/src/index.ts` with a deliberate,
  reviewed public surface.
- Keep `typecheck`, `lint`, and `build` green before opening a PR.
