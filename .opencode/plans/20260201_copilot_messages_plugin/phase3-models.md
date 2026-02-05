# Phase 3: Model Registry (Copilot /models)

## Checklist

### [Phase: BASELINE]

- [x] [T00] Verify baseline is clean in worktree (`bun test`, `bun run typecheck`).

### [Phase: RED]

- [x] [T01] Add `src/models/registry.test.ts` that drives `fetchModels()` via a real `Bun.serve()` test server and asserts:
  - request is `GET /models`
  - required VSCode-style headers are present (at minimum: `authorization`, `user-agent`, `editor-version`, `editor-plugin-version`, `copilot-integration-id`, `x-request-id`, `x-github-api-version`)
  - intent headers are `x-interaction-type: model-access` and `openai-intent: model-access`
- [x] [T02] In the same test, return a response containing:
  - one model where `supported_endpoints` includes `"/v1/messages"`
  - one model without `"/v1/messages"`
    and assert `fetchModels()` filters correctly (only the messages-capable model returns).
- [x] [T03] Add a mapping assertion that the returned OpenCode model object matches the required shape:
  - `providerID: "copilot-messages"`
  - `api: { npm: "@ai-sdk/anthropic" }`
  - `cost: { input: 0, output: 0 }`
  - `limit.context` and `limit.output` mapped from `model.capabilities.limits.*`
  - `options.maxThinkingBudget` / `options.minThinkingBudget` mapped from `model.capabilities.supports.*`
- [x] [T04] Add a parsing-focused test case that returns each of the likely response envelopes and asserts all are accepted:
  - raw array: `CopilotModel[]`
  - `{ data: CopilotModel[] }`
  - `{ models: CopilotModel[] }`
    (This keeps us resilient if Copilot changes the JSON envelope.)

---

- [ ] **COMMIT**: `test: cover copilot /models registry`

---

### [Phase: GREEN]

- [x] [T05] Implement `mapToOpencodeModel(model: CopilotModel)` in `src/models/registry.ts` to produce:
  ```ts
  {
    id: model.id,
    name: model.name,
    providerID: "copilot-messages",
    api: { npm: "@ai-sdk/anthropic" },
    cost: { input: 0, output: 0 },
    limit: {
      context: model.capabilities.limits.max_context_window_tokens,
      output: model.capabilities.limits.max_output_tokens,
    },
    options: {
      maxThinkingBudget: model.capabilities.supports.max_thinking_budget,
      minThinkingBudget: model.capabilities.supports.min_thinking_budget,
    },
  }
  ```
- [x] [T06] Implement `fetchModels()` in `src/models/registry.ts`:
  - hits `GET https://api.copilot.com/models` by default (overrideable base `url` + injected `fetch` for tests)
  - uses VSCode headers via `buildHeaders({ sessionToken, initiator: "agent", ... })` and then sets:
    - `x-interaction-type = "model-access"`
    - `openai-intent = "model-access"`
  - parses any of the supported envelopes (T04)
  - filters to `supported_endpoints.includes("/v1/messages")`
  - returns `CopilotModel[]` mapped through `mapToOpencodeModel()`
- [x] [T07] Update the docstring in `src/models/registry.ts` to match reality:
  - endpoint is `https://api.copilot.com/models` (not `api.github.com/copilot_internal/v2/models`)
  - keep the `supported_endpoints` filter description

---

- [ ] **COMMIT**: `feat: fetch and map copilot models registry`

---

### [Phase: REFACTOR]

- [x] [T08] Tighten types without `any`:
  - export an `OpencodeModel` type from `src/models/registry.ts` (or infer where possible)
  - ensure `options` fields remain optional/`undefined`-safe
- [x] [T09] (Optional) If it meaningfully reduces duplication, extend `buildHeaders()` to accept an optional intent/interaction override so `fetchModels()` doesn’t mutate header values inline. Keep the default behavior unchanged.

---

- [ ] **COMMIT**: `refactor: simplify model registry headers/types`

---

## Summary

### Goal

Given a valid Copilot session token, when we call `fetchModels()`, then it should GET `https://api.copilot.com/models` with VSCode-like headers, filter to models that support `"/v1/messages"`, and return those models mapped into the required OpenCode model shape.

### Pitfalls

- Don’t accidentally call the GitHub `copilot_internal` models endpoint; Phase 3 requires `api.copilot.com/models`.
- Don’t rely on a single JSON envelope shape; accept the common variants so the plugin doesn’t break on a server-side change.
- Avoid over-testing random values like `x-request-id`; assert presence/format, not exact equality.

## Details

- [T01-T04] File: `src/models/registry.test.ts`
  - Use `Bun.serve()` like the existing auth tests to avoid mocks while keeping tests hermetic.
  - Validate request path + key headers, and return synthetic `CopilotModel` JSON payloads.

- [T05-T07] File: `src/models/registry.ts`
  - Add exports:
    - `export type OpencodeModel = { ... }` (minimal shape needed for provider registration later)
    - `export function mapToOpencodeModel(model: CopilotModel): OpencodeModel`
    - `export async function fetchModels(input: { sessionToken: string; fetch?: typeof fetch; url?: string; betaFeatures?: string[] }): Promise<OpencodeModel[]>`
  - Implementation notes:
    - Prefer `const run = input.fetch ?? fetch` and early returns; avoid `let` / `else`.
    - Build URL with `new URL("/models", input.url ?? "https://api.copilot.com")`.

## Verification

- [ ] All tests pass in the worktree (`bun test`)
- [ ] No type errors (`bun run typecheck`)
- [ ] Manual (optional, if you have a real session token):
  - `curl -sS https://api.copilot.com/models -H "Authorization: Bearer $TOKEN" -H "User-Agent: GitHubCopilotChat/0.36.2" ...` and confirm `supported_endpoints` includes `"/v1/messages"` for the returned Claude models.
