# Monorepo Migration Plan (Bun Workspaces + Turborepo)

## Goal

Reorganize this repo from a single package into a monorepo that keeps `opencode-copilot-messages` behavior unchanged and is ready for a second sibling package under `packages/`.

## Confirmed Decisions

- Workspace tooling: Bun workspaces + Turborepo
- Package layout: `packages/*`
- Config strategy: shared root configs with per-package `extends`
- Root scripts: orchestrate all packages

## Target Structure

```text
.
├── package.json                      # workspace root (private)
├── bun.lock
├── turbo.json
├── biome.json                        # shared config
├── tsconfig.base.json                # shared TS base
├── tsconfig.build.base.json          # shared build base
├── .husky/
├── README.md                         # monorepo README
├── LICENSE
└── packages/
    └── opencode-copilot-messages/
        ├── package.json
        ├── tsconfig.json
        ├── tsconfig.build.json
        ├── README.md
        ├── LICENSE
        ├── src/
        └── dist/
```

## Critical Files To Modify

- `package.json` (root)
- `turbo.json` (new)
- `tsconfig.base.json` (new)
- `tsconfig.build.base.json` (new)
- `biome.json` (root, adjust includes if needed for `packages/**`)
- `.husky/pre-commit`
- `.gitignore`
- `README.md` (root)
- `packages/opencode-copilot-messages/package.json` (moved + updated)
- `packages/opencode-copilot-messages/tsconfig.json` (moved + extends root)
- `packages/opencode-copilot-messages/tsconfig.build.json` (moved + extends root)
- `packages/opencode-copilot-messages/README.md` (moved)
- `packages/opencode-copilot-messages/LICENSE` (copy from root for publish parity)

## Implementation Plan

### 1) REFACTOR Baseline (must be green before moving files)

1. Run current root checks to establish no-regression baseline:
   - `bun test`
   - `bun run check`
   - `bun run lint`
2. If any unexpected failures exist, stop and report before migration.

### 2) Create Workspace Root

1. Convert root `package.json` into workspace root:
   - Set `"private": true`
   - Add `"workspaces": ["packages/*"]`
   - Add root scripts:
     - `build`: `turbo run build`
     - `test`: `turbo run test`
     - `lint`: `turbo run lint`
     - `check`: `turbo run check`
     - `format`: `turbo run format`
   - Keep shared tooling devDependencies at root (`turbo`, `typescript`, `@biomejs/biome`, `husky`, `lint-staged`, etc.)
2. Create `turbo.json` with tasks:
   - `build` depends on `^build`, outputs `dist/**`
   - `test`, `lint`, `check`, `format` as cache-safe non-output tasks
   - Add `globalDependencies` for root configs (`biome.json`, `tsconfig.base.json`, `tsconfig.build.base.json`)

### 3) Introduce Shared Configs

1. Add `tsconfig.base.json` at root with shared compiler options from current `tsconfig.json`.
2. Add `tsconfig.build.base.json` at root with build-level defaults.
3. Keep one shared `biome.json` at root; ensure it lints `packages/**` and still excludes build artifacts and lockfiles.

### 4) Move Existing Package Into `packages/`

1. Create `packages/opencode-copilot-messages/`.
2. Move from root into package directory:
   - `src/`
   - `package.json`
   - `tsconfig.json`
   - `tsconfig.build.json`
   - `README.md`
3. Copy root `LICENSE` to `packages/opencode-copilot-messages/LICENSE` so package publishing still includes a license file.
4. Keep `.husky/`, `turbo.json`, root configs, and workspace lockfile at root.

### 5) Update Package-Local Config and Scripts

1. In `packages/opencode-copilot-messages/tsconfig.json`:
   - `extends: "../../tsconfig.base.json"`
   - keep package-local `include`/`exclude`
2. In `packages/opencode-copilot-messages/tsconfig.build.json`:
   - `extends: "../../tsconfig.build.base.json"` (or package tsconfig if simpler)
   - keep test exclusions
3. In `packages/opencode-copilot-messages/package.json`:
   - Keep package identity/publish fields unchanged (`name`, `version`, `main`, `types`, `files`, `publishConfig`)
   - Keep package scripts (`build`, `test`, `check`, `lint`, `format`, release scripts) package-local
   - Remove `prepare` from package (Husky should be root-owned)
   - Remove package-local `lint-staged` block if moving fully to root lint-staged

### 6) Update Husky + Lint-Staged For Monorepo

1. Keep Husky installed/configured at root only.
2. Update `.husky/pre-commit` to run repo-level checks against staged files from root (via root `lint-staged`).
3. Ensure lint-staged patterns cover `packages/**/*.{ts,tsx,js,jsx,json}`.

### 7) Root Documentation For Monorepo

1. Replace root `README.md` with monorepo overview:
   - repo purpose
   - workspace layout (`packages/*`)
   - root commands (`bun run build/test/lint`)
   - pointer to package docs in `packages/opencode-copilot-messages/README.md`
2. Keep package README content package-specific.

### 8) Add New-Package-Ready Convention

Define the template for the next package under `packages/<new-name>/`:

- package-local `package.json` with `build/test/check/lint/format`
- `tsconfig.json` extending `../../tsconfig.base.json`
- `tsconfig.build.json` extending shared build base
- `src/` entrypoint

## Verification (End-to-End)

### A) Workspace + Tooling

1. `bun install` (from repo root)
   - Expect one root `bun.lock` updated for workspaces.
2. `bun run lint` (root)
   - Expect turbo to run lint in `packages/opencode-copilot-messages` successfully.
3. `bun run check` (root)
   - Expect package check to pass unchanged.
4. `bun run test` (root)
   - Expect all existing tests to pass unchanged.
5. `bun run build` (root)
   - Expect package build output under `packages/opencode-copilot-messages/dist`.

### B) Package Publishability

1. From `packages/opencode-copilot-messages/`, run `npm pack --dry-run`
   - Expect package name/version unchanged and tarball includes `dist/`, `README.md`, `LICENSE`.

### C) Targeted Package Runs

1. Run filtered task to ensure workspace targeting works (turbo filter for package).
2. Confirm commands execute only the selected package.

## Risks And Mitigations

- Root/package script drift: keep script names consistent (`build/test/check/lint/format`) across packages.
- Missing package license after move: explicitly copy `LICENSE` into package.
- Hook behavior change: keep Husky at root and verify staged-file linting still runs.
- Path regressions after move: rely on per-package cwd scripts and run full baseline suite before/after.

## Rollback Plan

If migration fails validation:

1. Move package files back to root.
2. Remove `turbo.json`, workspace fields, and root shared tsconfig base files.
3. Restore prior root `package.json` scripts.
4. Run `bun install` and baseline checks again.
