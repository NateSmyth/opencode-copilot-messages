# OpenCode Packages Monorepo

This repository is a Bun workspace monorepo for OpenCode-related packages.

## Workspace Layout

- `packages/opencode-copilot-messages`: Copilot Messages API provider plugin for OpenCode

Add new packages under `packages/` so they are picked up automatically by workspace and Turbo scripts.

## Commands

Run from repository root:

- `bun run build`
- `bun run test`
- `bun run typecheck`
- `bun run lint`
- `bun run format`

For package-specific usage and configuration, see `packages/opencode-copilot-messages/README.md`.
