---
project: opencode-copilot-responses
type: overview
date: 20260218
title: Copilot Responses API Plugin
---

# Copilot Responses API Plugin

## Problem Statement

GPT-5.3-Codex is available on GitHub Copilot's `/responses` API endpoint but is not exposed by opencode's built-in `github-copilot` provider. The built-in provider's model list does not yet include gpt-5.3-codex. This plugin unlocks access to gpt-5.3-codex (and all other `/responses`-capable Copilot models) by implementing a custom opencode plugin that authenticates via the Copilot CLI's OAuth flow and proxies requests through the Copilot API's `/responses` endpoint.

## Solution Direction

### Chosen Approach

Build an opencode plugin (`opencode-copilot-responses`) that:

1. Authenticates via GitHub OAuth device flow using the **Copilot CLI client ID** — required because the Copilot API is client ID-aware and gates model access based on the originating OAuth application.
2. Discovers models dynamically from the Copilot API's `/models` endpoint, filtering for those supporting the `/responses` endpoint.
3. Uses `@ai-sdk/openai` (v2+, AI SDK 5) as the AI SDK provider — this package natively supports the OpenAI Responses API (`/responses`), SSE streaming, reasoning configuration, and custom fetch/base URL injection.
4. Injects Copilot-specific headers via a custom `fetch` function returned by the auth loader.

### Rationale

- **`@ai-sdk/openai` over custom SDK**: The Responses API is OpenAI-format. AI SDK 5's `@ai-sdk/openai` has full native support for `/responses` including SSE streaming, `reasoning.effort`/`reasoning.summary`, and provider options. No custom SDK needed.
- **CLI auth over VS Code auth**: The user specified this. CLI auth is simpler (no session token exchange, no VS Code credential spoofing) and is the natural fit for a terminal-based tool like opencode.
- **Dynamic model discovery over hardcoding**: Same strategy as `opencode-copilot-messages`. Models are fetched from `/models` and filtered by `supported_endpoints`, ensuring new models appear automatically.
- **No stash mechanism**: Unlike the messages package, the Responses API's reasoning/effort handling is natively supported by `@ai-sdk/openai`. The elaborate stash-swap workaround from the messages package is unnecessary.

### Alternatives Considered

- **Share built-in `github-copilot` auth**: Rejected. The Copilot API is client ID-aware; using a different client ID is a functional requirement, not a design choice.
- **Custom AI SDK provider**: Rejected. `@ai-sdk/openai` already implements the Responses API. Reimplementing it would duplicate work with no benefit.
- **Hardcoded model list**: Rejected. Dynamic discovery is more maintainable and future-proof.

## Architecture Overview

### Key Differences from `opencode-copilot-messages`

| Aspect             | Messages Package                                 | Responses Package                                             |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------- |
| API endpoint       | `/v1/messages` (Anthropic format)                | `/responses` (OpenAI format)                                  |
| AI SDK             | `@ai-sdk/anthropic`                              | `@ai-sdk/openai`                                              |
| Auth flow          | VS Code OAuth client ID + session token exchange | Copilot CLI client ID, `gho_` token used directly             |
| Base URL discovery | Parsed from session token (`proxy-ep=`)          | Entitlement check (`GET /copilot_internal/user`) at auth time |
| Token refresh      | Session token expires, requires periodic refresh | OAuth token long-lived, no refresh mechanism                  |
| Reasoning handling | Stash mechanism to work around SDK limitations   | Native SDK support, no workarounds                            |
| Headers            | Spoofs VS Code extension headers                 | CLI-style headers                                             |
| Integration ID     | `vscode-chat`                                    | `copilot-developer-cli`                                       |

### SDK Resolution Path

Understanding how opencode resolves plugin-registered models is critical:

1. Plugin's `auth.loader` returns `{ fetch, baseURL, apiKey, name }` — merged into `provider.options`
2. `getSDK(model)` spreads `provider.options` and calls `createOpenAI({ name, fetch, baseURL, apiKey })`
3. `getLanguage(model)` finds no custom model loader for `"copilot-responses"`, falls through to `sdk.languageModel(modelId)`
4. In AI SDK 5, `sdk.languageModel(modelId)` returns a Responses API model by default
5. The model posts to `${baseURL}/responses` using the custom fetch

**Provider options keying**: opencode's `sdkKey("@ai-sdk/openai")` maps to `"openai"`, so provider options (e.g., reasoning effort from variants) are emitted as `providerOptions: { openai: { ... } }`. The SDK factory must receive `name: "openai"` (not `"copilot-responses"`) so that `parseProviderOptions` finds the options under the correct key. The auth.loader return value's `name` field overrides the default because of JavaScript's spread semantics in `getSDK()`: `bundledFn({ name: model.providerID, ...options })` — `options.name` wins.

### Auth Flow

```
User runs `opencode auth login` → selects "copilot-responses"
  │
  ├─ POST github.com/login/device/code (CLI client ID, read:user scope)
  │   → returns device_code, user_code, verification_uri
  │
  ├─ User visits URL, enters code
  │
  ├─ Poll POST github.com/login/oauth/access_token
  │   → returns gho_<token>
  │
  ├─ GET api.github.com/copilot_internal/user (Bearer gho_<token>)
  │   → returns endpoints.api (e.g., "https://api.individual.githubcopilot.com")
  │   → validates Copilot entitlement
  │
  └─ Store: { type: "oauth", refresh: gho_token, access: gho_token, expires: 0, baseUrl }
```

On subsequent loads, `auth.loader` reads stored auth, uses cached `baseUrl`, and returns options with custom fetch.

### Request Flow

```
opencode core → config hook registers "copilot-responses" provider
             → auth.loader returns { name: "openai", baseURL, apiKey: "", fetch: customFetch }
             → chat.headers hook sets x-initiator for subagent sessions
             → AI SDK 5 creates OpenAI Responses model
             → sdk.languageModel(modelId) → OpenAIResponsesLanguageModel
             → POST ${baseURL}/responses with SSE streaming
             → customFetch injects: Authorization, User-Agent, Copilot-Integration-Id,
               X-GitHub-Api-Version, interaction headers, initiator, vision
             → strips x-api-key
```

### Header Set

Headers injected by custom fetch (initial set; minimum required set to be discovered empirically through live testing):

| Header                   | Value                     | Notes                                          |
| ------------------------ | ------------------------- | ---------------------------------------------- |
| `Authorization`          | `Bearer gho_<token>`      | From stored auth                               |
| `User-Agent`             | `copilot/<version> (...)` | CLI-style UA string                            |
| `Copilot-Integration-Id` | `copilot-developer-cli`   | CLI integration identifier                     |
| `X-GitHub-Api-Version`   | `2025-05-01`              | Matches CLI (captured 2026-02-18)              |
| `X-Interaction-Type`     | `conversation-agent`      | Required per reference                         |
| `Openai-Intent`          | `conversation-agent`      | Required per reference                         |
| `X-Interaction-Id`       | `<uuid>`                  | Per-request UUID                               |
| `x-initiator`            | `user` or `agent`         | Based on message structure / session parentage |
| `Copilot-Vision-Request` | `true`                    | Conditional: only when images present          |
| `x-request-id`           | `<uuid>`                  | Per-request UUID                               |

**Excluded**: `X-Stainless-*` telemetry headers — not functionally required.

### Model Mapping

Models fetched from `GET ${baseUrl}/models` are:

1. Filtered: only those with `supported_endpoints` including `"/responses"`
2. Mapped to opencode `Model` format with:
   - `providerID: "copilot-responses"`
   - `api.npm: "@ai-sdk/openai"`
   - `api.url: <baseUrl>` (from cached entitlement check)
   - `cost: { input: 0, output: 0 }` (Copilot subscription-based)
   - Capabilities derived from model metadata (reasoning, vision, tool calls, etc.)

## High-Level Tasks

> Ordered by sequence. Each task is a coherent unit for a planning/execution cycle.

1. **Auth Module** — Implement OAuth device flow (CLI client ID, `read:user` scope), entitlement check for base URL discovery, and token storage types. [Dependencies: none]
2. **Models Module** — Fetch `/models` endpoint, filter by `/responses` support, map to opencode `Model` format with correct capabilities. [Dependencies: 1]
3. **Provider Module** — Custom fetch interceptor with header injection, request body parsing for initiator/vision detection, `x-api-key` stripping. [Dependencies: 1]
4. **Plugin Integration** — Wire auth, models, and provider into plugin hooks: `config` (register provider), `auth` (authorize + loader), `chat.headers` (subagent initiator). [Dependencies: 1, 2, 3]
5. **Live Validation & Header Tuning** — End-to-end testing against the real Copilot API to validate auth, model access, streaming, and empirically determine the minimum required header set. [Dependencies: 4]

### Success Criteria

- [ ] Plugin registers `copilot-responses` provider in opencode
- [ ] Users can authenticate via `opencode auth login` → "copilot-responses"
- [ ] Models are dynamically discovered from the Copilot API `/models` endpoint
- [ ] gpt-5.3-codex is accessible and produces streaming responses
- [ ] Reasoning effort configuration works (via opencode's variant system + `@ai-sdk/openai` native handling)
- [ ] Subagent sessions correctly set `x-initiator: agent`
- [ ] All tests pass using real `Bun.serve()` HTTP servers (no mocking)
- [ ] Plugin follows TDD workflow (RED-GREEN-REFACTOR) with atomic commits

## Constraints

| Type       | Constraint                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------- |
| Hard       | Must use Copilot CLI OAuth client ID (`Ov23ctDVkRmgkPke0Mmm`) — API is client ID-aware         |
| Hard       | Must use `@ai-sdk/openai` v2+ (AI SDK 5) for native Responses API support                      |
| Hard       | Must follow TDD (RED-GREEN-REFACTOR) per project AGENTS.md                                     |
| Hard       | No mocking — tests use real `Bun.serve()` HTTP servers                                         |
| Hard       | Must pass auth.loader `name: "openai"` for provider options key alignment                      |
| Soft       | Start with `read:user` OAuth scope; widen empirically if needed                                |
| Soft       | Match CLI `X-GitHub-Api-Version: 2025-05-01` (observed in production 2026-02-18)               |
| Soft       | Initial header set includes all CLI headers minus telemetry; strip to minimum via live testing |
| Dependency | Scaffolded package at `packages/opencode-copilot-responses/`                                   |
| Dependency | Existing reference implementation at `packages/opencode-copilot-messages/`                     |

## Reference Materials

| Material                 | Location                                                  | Purpose                                                     |
| ------------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| CLI auth flow            | `.opencode/reference/copilot-CLI-auth-flow.md`            | Full 7-step auth sequence with all endpoints/tokens         |
| CLI /responses request   | `.opencode/reference/copilot-CLI-responses-request.md`    | Complete request/response with SSE events for gpt-5.3-codex |
| CLI /models request      | `.opencode/reference/copilot-CLI-models-request.md`       | Model discovery endpoint with capability metadata           |
| CLI README               | `.opencode/reference/COPILOT-CLI-README.md`               | Official Copilot CLI documentation                          |
| Messages package         | `packages/opencode-copilot-messages/`                     | Reference implementation (custom provider plugin pattern)   |
| opencode copilot plugin  | `../opencode/packages/opencode/src/plugin/copilot.ts`     | Built-in copilot auth (CLI-style, `gho_` token direct use)  |
| opencode copilot SDK     | `../opencode/packages/opencode/src/provider/sdk/copilot/` | Built-in Responses API implementation                       |
| opencode provider system | `../opencode/packages/opencode/src/provider/provider.ts`  | SDK resolution, model loading, options merging              |
| opencode plugin types    | `../opencode/packages/plugin/src/index.ts`                | Plugin/Hooks/AuthHook type definitions                      |

## Open Questions

_None remaining. All decisions resolved through cyclic refinement._
