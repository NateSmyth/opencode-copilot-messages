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

[TBD — to be filled during planning phase]

### Details

[TBD — to be filled during planning phase]
