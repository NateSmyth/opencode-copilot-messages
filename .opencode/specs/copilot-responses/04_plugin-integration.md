---
project: opencode-copilot-responses
type: task
title: Plugin Integration
description: Wire auth, models, and provider into opencode plugin hooks
number: 04
blockedBy: [01, 02, 03]
blocks: [05]
---

# Plugin Integration

## Goal

Wire the auth, models, and provider modules into a complete opencode plugin. The plugin registers the `copilot-responses` provider via the `config` hook, implements the full `auth` hook (with OAuth device flow and a loader that fetches models and returns custom fetch), and uses the `chat.headers` hook to set `x-initiator: agent` for subagent sessions.

## Acceptance Criteria

This is done:

- when the `config` hook runs
  - given `providers["copilot-responses"]` does not exist in config
    - then it injects `{ npm: "@ai-sdk/openai", name: "Copilot Responses", models: {} }` into `config.provider["copilot-responses"]`
  - given `providers["copilot-responses"]` already exists
    - then it does not overwrite the existing config

- when the `auth` hook is registered
  - given the hook definition
    - then `provider` is `"copilot-responses"`
    - then `methods` contains one entry of type `"oauth"` with label `"Login with GitHub (Copilot CLI)"`

- when `auth.authorize()` is called
  - given a successful OAuth flow
    - then it initiates the device code flow with the CLI client ID
    - then it returns `{ url, instructions, method: "auto", callback }` where callback polls for the token
    - then on successful token receipt, the callback performs the entitlement check
    - then the callback returns `{ type: "success", refresh: gho_token, access: gho_token, expires: 0 }` with the base URL from the entitlement check

- when `auth.loader()` is called on startup
  - given valid stored auth with a `gho_` token and cached base URL
    - then it fetches models from `${baseUrl}/models`
    - then it merges fetched models with any existing user-configured models (user config takes precedence for `limit`, `options`, `headers`, `variants`)
    - then it returns `{ name: "openai", apiKey: "", baseURL, fetch: customFetch }`
  - given stored auth is missing or invalid type
    - then it returns empty options `{}`

- when the `chat.headers` hook runs
  - given the provider is `copilot-responses` and the session has a `parentID`
    - then it sets `output.headers["x-initiator"] = "agent"`
  - given the provider is not `copilot-responses`
    - then it does nothing
  - given the session has no `parentID`
    - then it does not set the `x-initiator` header

### Verification Criteria

1. Run `bun test src/` from the `packages/opencode-copilot-responses/` directory
2. All tests must pass with zero failures
3. Tests must use real `Bun.serve()` HTTP servers serving mock endpoints (`/copilot_internal/user`, `/models`, `/responses`)
4. Verify `config` hook injects provider only when absent
5. Verify `auth.authorize()` initiates device flow with correct client ID and scope
6. Verify `auth.authorize()` callback performs entitlement check and caches base URL
7. Verify `auth.loader()` fetches models, merges with existing config, and returns correct options shape
8. Verify `auth.loader()` returns `name: "openai"` (critical for provider options key alignment)
9. Verify `auth.loader()` returns a custom fetch that correctly injects headers and strips `x-api-key`
10. Verify `chat.headers` hook sets `x-initiator: agent` for subagent sessions (those with `parentID`)
11. Verify `chat.headers` hook is a no-op for non-copilot-responses providers
12. End-to-end: verify that the complete flow from config → auth → model fetch → custom fetch works with a mock server mimicking the Copilot API

## Considerations

- **`name: "openai"` in loader return**: The auth.loader MUST return `{ name: "openai", ... }` so that the SDK factory creates an OpenAI provider with the `"openai"` provider name. This is critical: opencode's `sdkKey("@ai-sdk/openai")` maps to `"openai"`, so provider options (reasoning effort from variants) are emitted as `providerOptions: { openai: { ... } }`. The SDK's `parseProviderOptions` looks up options by the provider's registered name. If the name is `"copilot-responses"` instead of `"openai"`, reasoning options won't be found.

  The spread semantics in `getSDK()` — `bundledFn({ name: model.providerID, ...options })` — ensure that `options.name` (from our loader) overrides `model.providerID`.

- **Model merging**: When `auth.loader` returns models, they must be merged with any user-configured models on the provider. The pattern from the messages package: iterate fetched models, check if the model ID already exists in `provider.models`, and if so, let user config override `limit`, `options`, `headers`, `variants`. New models (not in user config) are added as-is.

- **Stored auth shape**: The `auth.authorize()` callback must return the base URL as part of the stored auth. The opencode `AuthOauthResult` type supports `{ refresh, access, expires }` — the base URL can be stored in a custom field. Check how the messages package handles this (it stores `{ type: "oauth", refresh: gho_token, access: session_token, expires: timestamp }`). Our type: `{ type: "oauth", refresh: gho_token, access: gho_token, expires: 0 }` with base URL potentially needing a creative storage approach if the plugin auth type doesn't support custom fields.

  **Important**: Review the `AuthOauthResult` type definition. If custom fields aren't supported, the base URL may need to be stored differently (e.g., hardcoded fallback if not in auth, or re-fetched on every load).

- **Session lookup for subagent detection**: The `chat.headers` hook needs to call `input.client.session.get()` to check if the session has a `parentID`. This mirrors the messages package's and built-in copilot plugin's approach. Handle the case where session lookup fails (e.g., `.catch(() => undefined)`).

- **Plugin function signature**: The plugin is an async function receiving `PluginInput` (with `client`, `project`, `directory`, `worktree`, `serverUrl`, `$`) and returning `Hooks`. Same as the messages package.

- **No `chat.params` hook needed**: Unlike the messages package, there are no SDK compatibility workarounds needed for reasoning/effort. The `@ai-sdk/openai` SDK handles everything natively. The only hook beyond `config` and `auth` is `chat.headers` for subagent detection.

- **Reference implementation**: `packages/opencode-copilot-messages/src/plugin.ts` — same hook structure but simpler (no `chat.params`, no stash mechanism, no effort header mapping).

- **TDD**: Write comprehensive integration tests in `plugin.test.ts` before implementation. These should test the complete hook lifecycle with mock servers.

## Plan

### Checklist

- [x] [T00] Establish baseline: `cd packages/opencode-copilot-responses && bun test`

#### Phase: RED

- [x] [T01] Expand `src/plugin.test.ts` to cover `config` hook provider injection (inject when absent; no overwrite when present)
- [x] [T02] Add `auth` hook contract tests (provider id, single oauth method + label; `authorize()` returns `{ url, instructions, method: "auto", callback }`)
- [x] [T03] Add end-to-end auth flow test: `authorize()` → callback polls token → entitlement check → returns stored auth including `baseUrl`
- [x] [T04] Add `auth.loader()` integration tests:
  - returns `{}` when no stored auth / wrong type
  - when stored auth has `gho_` token + baseUrl, fetches `/models`, merges into provider models (user overrides win), returns `{ name: "openai", apiKey: "", baseURL, fetch }`
  - when stored auth is missing `baseUrl`, loader falls back to entitlement fetch and persists the discovered baseUrl
  - returned `fetch` strips `x-api-key` and injects Copilot headers (smoke test) and preserves caller `x-initiator`
- [x] [T05] Add `chat.headers` hook tests: sets `x-initiator: agent` for `copilot-responses` subagent sessions (parentID present); no-op otherwise

---

- [x] **COMMIT**: `test: cover copilot responses plugin hooks`

#### Phase: GREEN

- [x] [T06] Implement `config` hook in `src/plugin.ts` to register `copilot-responses` provider only when missing
- [x] [T07] Implement `auth.methods[0].authorize()` in `src/plugin.ts` using device flow + polling + entitlement check; return `success` auth including `baseUrl`
- [x] [T08] Implement `auth.loader()` in `src/plugin.ts`:
  - validate stored auth shape and `gho_` token
  - resolve `baseUrl` (use cached value, otherwise entitlement fallback)
  - fetch `/models` and merge into provider models (user config wins for `limit`, `options`, `headers`, `variants`)
  - return `{ name: "openai", apiKey: "", baseURL: baseUrl, fetch: customFetch }` where `customFetch` delegates to `copilotResponsesFetch`
- [x] [T09] Implement `chat.headers` hook in `src/plugin.ts` to set `x-initiator: agent` for sessions with `parentID` (and safely no-op on lookup failure)

---

- [x] **COMMIT**: `feat: integrate copilot responses plugin hooks`

#### Phase: REFACTOR

- [x] [T10] Refactor `src/plugin.ts` for clarity/robustness (helper(s) for model merge + baseUrl resolution; avoid `let`/`else`; keep behavior stable)
- [x] [T11] Tighten types (avoid `any`, minimize casts) and keep tests focused on observable behavior (no provider/header implementation duplication)

---

- [x] **COMMIT**: `refactor: tighten copilot responses plugin integration`

### Details

- [T00] Baseline must be green; if not, stop and report unexpected failures.

- [T01] File: `packages/opencode-copilot-responses/src/plugin.test.ts`
  - Call `await CopilotResponsesPlugin(input)` and assert returned hooks include `config`, `auth`, and `chat.headers`.
  - `config` injection behavior:
    - With `config = { provider: {} }`, after `await hooks.config(config)` assert `config.provider["copilot-responses"]` equals:
      - `{ npm: "@ai-sdk/openai", name: "Copilot Responses", models: {} }`.
    - With `config.provider["copilot-responses"] = { npm: "custom", name: "Custom", models: { x: 1 } }`, assert `hooks.config` does not overwrite.

- [T02] File: `packages/opencode-copilot-responses/src/plugin.test.ts`
  - Assert `hooks.auth.provider === "copilot-responses"`.
  - Assert `hooks.auth.methods` has exactly one entry:
    - `{ type: "oauth", label: "Login with GitHub (Copilot CLI)" }`.
  - Call `authorize()` and assert it returns:
    - `url` (string), `instructions` (string), `method: "auto"`, and `callback` (function).

- [T03] File: `packages/opencode-copilot-responses/src/plugin.test.ts`
  - Use a real `Bun.serve()` server implementing:
    - `POST /login/device/code` → returns device payload
    - `POST /login/oauth/access_token` → returns `{ error: "authorization_pending" }` once, then `{ access_token: "gho_test", ... }`
    - `GET /copilot_internal/user` → returns `{ endpoints: { api: <serverBase> }, login: "octocat" }`
    - `GET /models` → returns a minimal `/responses` model list
  - Override `globalThis.fetch` in-test to forward requests to that server (preserve method/headers/body; rewrite to `serverBase + pathname + search`).
  - Call `const auth = await hooks.auth.methods[0].authorize()` then `const stored = await auth.callback()`.
  - Assert callback returns:
    - `{ type: "success", refresh: "gho_test", access: "gho_test", expires: 0 }` and includes `baseUrl` equal to server base.
  - Also assert server saw the correct device request shape:
    - `client_id === "Ov23ctDVkRmgkPke0Mmm"` and `scope === "read:user"`.

- [T04] File: `packages/opencode-copilot-responses/src/plugin.test.ts`
  - Loader empty-path:
    - `await hooks.auth.loader(async () => null, provider)` → `{}`.
    - `await hooks.auth.loader(async () => ({ type: "other" }), provider)` → `{}`.
  - Loader happy-path:
    - Given stored auth `{ type: "oauth", refresh: "gho_x", access: "gho_x", expires: 0, baseUrl: serverBase }`:
      - assert it `GET`s `${baseUrl}/models` and merges returned models into `provider.models`.
      - seed `provider.models[<id>]` with user overrides and assert after loader:
        - user overrides win for `limit`, `options`, `headers`, `variants`.
      - assert loader returns `{ name: "openai", apiKey: "", baseURL: baseUrl, fetch }`.
  - Loader baseUrl fallback (robust reload behavior):
    - Given stored auth missing/empty `baseUrl`, loader must call entitlement (`/copilot_internal/user`) to re-discover it.
    - Provide `input.client.auth.set` stub and assert it is called to persist the discovered `baseUrl` back to opencode.
  - Custom fetch wiring (smoke):
    - Call returned `fetch` against `${baseUrl}/responses` with `x-api-key` set and assert server receives:
      - `x-api-key` stripped
      - `authorization: Bearer gho_x`
      - at least one Copilot invariant header (e.g. `copilot-integration-id`, `x-github-api-version`).
    - Also pass a caller header `x-initiator: agent` and assert it remains `agent` (provider fetch must not override caller-supplied initiator).

- [T05] File: `packages/opencode-copilot-responses/src/plugin.test.ts`
  - Provide `input.client.session.get` stub:
    - session `child` returns `{ data: { parentID: "root" } }`
    - session `root` returns `{ data: {} }`
  - Call `hooks["chat.headers"]({ sessionID: "child", model: { providerID: "copilot-responses" } }, { headers: {} })` and assert `x-initiator === "agent"`.
  - Assert no header is set for:
    - `model.providerID !== "copilot-responses"`, or
    - `session` has no `parentID`.
  - Ensure session lookup failure is tolerated (e.g. stub throws; hook should no-op).

- [T06] File: `packages/opencode-copilot-responses/src/plugin.ts`
  - Implement `config` hook consistent with messages plugin:
    - ensure `config.provider` exists
    - only set `config.provider["copilot-responses"]` if not already set.

- [T07] File: `packages/opencode-copilot-responses/src/plugin.ts`
  - `auth` hook:
    - `provider: "copilot-responses"`
    - `methods: [{ type: "oauth", label: "Login with GitHub (Copilot CLI)", authorize }]`
  - `authorize`:
    - call `authorizeDeviceCode()`
    - return `{ url: verification_uri, instructions: `Enter code: ${user_code}`, method: "auto", callback }`
    - callback:
      - call `pollForToken({ deviceCode, interval, expiresAt })`
      - call `fetchEntitlement({ token: access_token })` to discover `baseUrl`
      - return `{ type: "success", refresh: gho, access: gho, expires: 0, baseUrl }` (store `baseUrl` as a custom field)

- [T08] File: `packages/opencode-copilot-responses/src/plugin.ts`
  - Treat stored auth as schema-light:
    - must be object with `type: "oauth"` and a `gho_` token in `access` (or `refresh` as fallback)
    - `baseUrl` may be missing on reload; handle it.
  - Resolve baseUrl:
    - if `stored.baseUrl` is a non-empty string, use it
    - otherwise call `fetchEntitlement({ token })` to discover `baseUrl`, then persist via `input.client.auth.set({ path: { id: "copilot-responses" }, body: { ...stored, baseUrl } })`.
  - Fetch + merge models:
    - call `fetchModels({ token, baseUrl })`
    - mutate `provider.models` (create if missing)
    - for each fetched model:
      - if absent, set as-is
      - if present, merge so that user config wins for `limit`, `options`, `headers`, `variants`.
  - Return provider options:
    - `{ name: "openai", apiKey: "", baseURL: baseUrl, fetch: (req, init) => copilotResponsesFetch(req, init, { token }) }`.

- [T09] File: `packages/opencode-copilot-responses/src/plugin.ts`
  - Implement `"chat.headers"`:
    - early-return unless `data.model.providerID === "copilot-responses"`
    - fetch session via `input.client.session.get({ path: { id: data.sessionID }, throwOnError: true })` and `.catch(() => undefined)`
    - if `session?.data?.parentID`, set `output.headers["x-initiator"] = "agent"`.

- [T10] Refactor without changing test intent:
  - keep helper functions inside `plugin.ts` (one-file preference)
  - avoid `try/catch` (except where unavoidable in tests for `fetch` override cleanup)
  - avoid `let`/`else` (use early returns / conditional expressions).

- [T11] Type tightening:
  - define local `ModelWithVariants = Model & { variants?: Record<string, unknown> }` as needed
  - keep stored auth handling tolerant (don’t assume `baseUrl` always exists)
  - keep tests asserting end behavior: hook outputs + network-visible requests, not internal helper calls.
