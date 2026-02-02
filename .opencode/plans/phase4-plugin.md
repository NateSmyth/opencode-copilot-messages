# Phase 4 + 5: Copilot Messages Plugin Assembly + Configuration

## Unresolved
> Blocking only.
- [ ] [U1] Confirm whether OpenCode expects the subagent override header key to be `x-initiator` (lowercase) vs `X-Initiator`. (OpenCode’s built-in Copilot plugin uses `x-initiator`, so this plan assumes lowercase.)

## Checklist

### [Phase: BASELINE]
- [x] [T00] Verify baseline is clean in worktree (`bun test`, `bun run typecheck`, `bun run lint`).

---

### [Phase: RED] Config loading (Phase 5)
- [x] [T01] Add `src/config/schema.test.ts` covering `loadConfig()`:
  - missing file → returns schema defaults (`debug: false`) with optional fields `undefined`
  - partial file (e.g. only `beta_features`) → still applies defaults
  - invalid types/ranges (e.g. `thinking_budget: 1`) → rejects
---
- [ ] **COMMIT**: `test: cover copilot-messages config loading`
---

### [Phase: GREEN] Config loading (Phase 5)
- [x] [T02] Implement `loadConfig()` in `src/config/schema.ts` using Bun file APIs and `configSchema` parsing.
---
- [ ] **COMMIT**: `feat: load copilot-messages config file`
---

### [Phase: REFACTOR] Config loading
- [x] [T03] Simplify config loader (single-path resolution, minimal parsing helpers, stable errors).
---
- [ ] **COMMIT**: `refactor: simplify copilot-messages config loader`
---

### [Phase: RED] Respect explicit `x-initiator` override (required for subagent forcing)
- [x] [T04] Extend `src/provider/fetch.test.ts`:
  - when caller sets `x-initiator: agent` but body would derive `user`, outgoing request keeps `x-initiator: agent`
---
- [ ] **COMMIT**: `test: allow forced x-initiator override`
---

### [Phase: GREEN] Respect explicit `x-initiator` override
- [x] [T05] Update `src/provider/fetch.ts` to prefer an existing `x-initiator` header (`user|agent`) over `determineInitiator(messages)`.
---
- [ ] **COMMIT**: `fix: respect explicit x-initiator header`
---

### [Phase: REFACTOR] Fetch override support
- [x] [T06] Keep fetch wrapper behavior unchanged for callers that do not set `x-initiator`.
---
- [ ] **COMMIT**: `refactor: keep fetch initiator override minimal`
---

### [Phase: RED] Plugin hooks: provider registration + subagent initiator (Phase 4)
- [x] [T07] Add `src/plugin.test.ts` covering:
  - `config` hook registers provider id `copilot-messages`
  - `chat.headers` sets `x-initiator: agent` **only** when:
    - `input.provider.info.id === "copilot-messages"`, and
    - `input.message.metadata.parentSessionId` is present
  - `chat.headers` does **not** set `x-initiator` for non-subagent messages or other providers
---
- [ ] **COMMIT**: `test: cover copilot-messages plugin hooks`
---

### [Phase: GREEN] Plugin hooks: provider registration + subagent initiator
- [x] [T08] Implement in `src/plugin.ts`:
  - `config` hook: ensure `config.provider["copilot-messages"]` exists with `npm: "@ai-sdk/anthropic"`, `name`, and empty `models` map
  - `chat.headers` hook: subagent detection via `input.message?.metadata?.parentSessionId` and sets `output.headers["x-initiator"] = "agent"` (provider-gated)
  - (Optional but recommended) `chat.params` hook: apply `thinking_budget` from plugin config into `output.options` for Anthropic provider options
---
- [ ] **COMMIT**: `feat: register provider and force initiator for subagents`
---

### [Phase: RED] auth.loader: refresh token, fetch/register models, return init config
- [x] [T09] Extend `src/plugin.test.ts` with a loader-focused test that (no real network):
  - provides OAuth auth (`{ type: "oauth", refresh, access, expires }`)
  - uses a local `Bun.serve()` server to validate the returned `fetch` behavior (strips `x-api-key`, injects `authorization: Bearer <session>`, preserves caller headers)
  - asserts `provider.models` is populated from registry results
  - asserts loader return:
    - `apiKey === ""`
    - `baseURL === "https://api.copilot.com/v1"`
    - `fetch` is a function
---
- [ ] **COMMIT**: `test: cover copilot-messages auth loader`
---

### [Phase: GREEN] auth.loader + auth.methods
- [x] [T10] Implement `auth.methods` in `src/plugin.ts` (device code OAuth) using the already-tested building blocks:
  - `authorizeDeviceCode()` + `pollForToken()` to obtain GitHub OAuth token
  - `exchangeForSessionToken()` to obtain Copilot session token
  - return `{ type: "success", refresh: <github>, access: <session>, expires: <ms epoch> }` in the `authorize` callback
- [x] [T11] Implement `auth.loader` in `src/plugin.ts`:
  - read plugin config via `loadConfig()` and pass `beta_features` to:
    - `fetchModels({ sessionToken, betaFeatures })`
    - returned `fetch` wrapper (`copilotMessagesFetch(..., { sessionToken, betaFeatures })`)
  - refresh session token if needed (based on stored `expires`):
    - if refreshed, persist via `input.client.auth.set({ path: { id: "copilot-messages" }, body: { type: "oauth", refresh, access, expires } })`
  - populate `provider.models[model.id] = model` for each model from registry
  - return init config:
    - `apiKey: ""`
    - `baseURL: "https://api.copilot.com/v1"` (must include `/v1`)
    - `fetch: (req, init) => copilotMessagesFetch(req, init, { sessionToken, betaFeatures })`
---
- [ ] **COMMIT**: `feat: implement copilot-messages auth loader and oauth method`
---

### [Phase: REFACTOR] Plugin assembly
- [ ] [T12] Reduce duplication and keep exported surface stable (`CopilotMessagesPlugin`, `CopilotMessagesConfig`, `determineInitiator`).
- [ ] [T13] Ensure no `any`, avoid `let`/`else`, and keep logic mostly inside `src/plugin.ts` with small local helpers only when reused.
---
- [ ] **COMMIT**: `refactor: simplify copilot-messages plugin assembly`
---

## Summary

### Goal
Given OpenCode loads this npm plugin, when configuration is applied and a Copilot Messages session runs, then the plugin registers the `copilot-messages` provider, loads user config from `~/.config/opencode/copilot-messages.json`, forces `x-initiator: agent` for subagent sessions, and wires auth/model discovery to return an Anthropic-compatible init config pointing at `https://api.copilot.com/v1`.

### Pitfalls
- Don’t let the fetch wrapper overwrite a forced `x-initiator` set by `chat.headers`.
- Avoid tests that depend on real Copilot/GitHub endpoints; use `Bun.serve()` and injectable inputs.
- Be careful with time units: OpenCode OAuth `expires` is in milliseconds; token refresh helpers use seconds.

## Details

### Primary sources / assumptions validated
- Plugin hook surface + signatures (`config`, `auth.loader`, `chat.headers`, `chat.params`) come from OpenCode’s plugin package: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/plugin/src/index.ts
- Reference implementation patterns for Copilot auth + `chat.headers` subagent override: https://raw.githubusercontent.com/anomalyco/opencode/dev/packages/opencode/src/plugin/copilot.ts
- AI SDK Anthropic provider supports custom `baseURL`, `apiKey`, and `fetch` options: https://ai-sdk.dev/providers/ai-sdk-providers/anthropic

### Target files and key exports
- `src/config/schema.ts`
  - `export const configSchema`
  - `export type CopilotMessagesConfig`
  - `export async function loadConfig(...)`
- `src/plugin.ts`
  - `export const CopilotMessagesPlugin: Plugin`
- `src/provider/fetch.ts`
  - `export async function copilotMessagesFetch(...)`

## Verification

- [ ] All tests pass (`bun test`)
- [ ] No type errors (`bun run typecheck`)
- [ ] Lint clean (`bun run lint`)
- [ ] Manual (local OpenCode): add plugin to `opencode.json` and verify:
  - provider appears as `copilot-messages`
  - `baseURL` hits `https://api.copilot.com/v1/messages`
  - subagent sessions send `x-initiator: agent`
