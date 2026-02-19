---
project: opencode-copilot-responses
type: task
title: Models Module
description: Model discovery, filtering by /responses, and mapping to opencode format
number: 02
blockedBy: [01]
blocks: [04]
---

# Models Module

## Goal

Implement model discovery from the Copilot API's `/models` endpoint. Fetch available models, filter for those supporting the `/responses` endpoint, and map them to opencode's `Model` type with correct capabilities, limits, and options. This module enables the plugin to dynamically register all Copilot models that work with the Responses API.

## Acceptance Criteria

This is done:

- when a consumer calls `fetchModels()`
  - given a valid auth token and base URL
    - then it GETs `${baseUrl}/models` with the correct Copilot headers
    - then it parses the response (handling `{ data: [...] }`, `{ models: [...] }`, and raw array envelopes)
    - then it filters to only models whose `supported_endpoints` includes `"/responses"`
    - then it returns an array of opencode `Model` objects

- when `mapToOpencodeModel()` maps a Copilot model
  - given a model with reasoning capabilities (`max_thinking_budget` defined)
    - then the mapped model has `capabilities.reasoning: true`
  - given a model with vision support
    - then the mapped model has `capabilities.attachment: true` and `input.image: true`
  - given any model
    - then `providerID` is `"copilot-responses"`
    - then `api.npm` is `"@ai-sdk/openai"`
    - then `api.url` is the provided base URL
    - then `cost` is all zeros (Copilot is subscription-based)
    - then `status` is `"beta"` if `preview: true`, otherwise `"active"`

- when the `/models` endpoint returns models with various `supported_endpoints`
  - given models supporting only `/chat/completions`
    - then they are excluded from results
  - given models supporting only `/responses`
    - then they are included
  - given models supporting both `/responses` and `/chat/completions`
    - then they are included

### Verification Criteria

1. Run `bun test src/models/` from the `packages/opencode-copilot-responses/` directory
2. All tests must pass with zero failures
3. Tests must use real `Bun.serve()` HTTP servers serving mock model responses
4. Verify the request sent to `/models` includes all required headers (authorization, user-agent, copilot-integration-id, api version, interaction type, openai-intent, x-request-id)
5. Verify all three response envelope formats are handled (array, `{data}`, `{models}`)
6. Verify endpoint filtering is correct (only `/responses` models pass)
7. Verify complete `Model` shape including all capability flags, cost, limits, status, and options
8. Compare a mapped model against the expected shape using a full real-world fixture inlined in tests (e.g., a gpt-5.3-codex `/models` payload)

## Considerations

- **Endpoint filter value**: The filter value is `"/responses"` (no `/v1/` prefix). This is confirmed by a real Copilot `/models` payload (use the inlined gpt-5.3-codex fixture in tests).

- **API URL in model**: Each mapped model's `api.url` should be the base URL from auth (e.g., `https://api.individual.githubcopilot.com`), NOT a hardcoded value. This is passed as input to `fetchModels()`.

- **Headers on /models request**: Match the Copilot CLI pattern. Required headers include `Authorization`, `Copilot-Integration-Id: copilot-developer-cli`, `X-GitHub-Api-Version: 2025-05-01`, `X-Interaction-Type: model-access`, `Openai-Intent: model-access`, `x-request-id: <uuid>`. Validate by asserting the request received by the test `Bun.serve()` server.

- **CopilotModel interface**: Define an interface matching the model shape from the `/models` response. Key fields: `id`, `name`, `vendor`, `preview`, `capabilities.limits` (context window, output, prompt tokens, vision), `capabilities.supports` (streaming, tool_calls, vision, parallel_tool_calls, structured_outputs), `supported_endpoints`. Keep it minimal: only fields the mapper uses.

- **No `adaptive_thinking` in Responses models**: Unlike the Anthropic models in the messages package, OpenAI Responses models use `reasoning.effort` natively via the SDK. The model metadata should NOT set `options.adaptiveThinking`. Instead, reasoning capability is indicated by `capabilities.reasoning: true` and opencode's variant system handles the rest through `providerOptions.openai.reasoningEffort`.

- **Reference implementation**: `packages/opencode-copilot-messages/src/models/registry.ts` — same pattern but with different provider ID, npm package, API URL, and endpoint filter.

- **TDD**: Write `registry.test.ts` with mock `/models` responses before implementation.

## Plan

### Checklist

- [ ] [T00] Establish baseline: `cd packages/opencode-copilot-responses && bun test`

#### Phase: RED

- [ ] [T01] Add `src/models/registry.test.ts` that drives `fetchModels()` through a real `Bun.serve()` server and asserts request + mapping end-to-end
- [ ] [T02] In the same test, return a mixed model list and assert filtering keeps only models whose `supported_endpoints` includes `"/responses"`
- [ ] [T03] Add a parsing-focused test that returns each supported envelope (`CopilotModel[]`, `{ data: [...] }`, `{ models: [...] }`) and asserts all are accepted
- [ ] [T04] Add focused mapping assertions for capabilities:
  - reasoning: `capabilities.supports.max_thinking_budget` present → `Model.capabilities.reasoning === true`
  - vision: model indicates vision support → `Model.capabilities.attachment === true` and `Model.capabilities.input.image === true`
- [ ] [T05] Add a “full-shape” mapping assertion using a real Copilot model payload fixture inlined in the test file (gpt-5.3-codex) and compare against an expected full `Model` object (provider/api/cost/limit/status/capabilities/options)

---

- [ ] **COMMIT**: `test: cover copilot responses /models registry`

#### Phase: GREEN

- [ ] [T06] Create `src/models/registry.ts` exporting:
  - `export interface CopilotModel { ... }` (matching the `/models` response shape we use)
  - `export function mapToOpencodeModel(model: CopilotModel, baseUrl: string): Model`
  - `export async function fetchModels(input: { token: string; baseUrl: string; fetch?: typeof fetch }): Promise<Model[]>`
- [ ] [T07] Implement envelope parsing (`parseModels`) to handle raw array, `{ data }`, and `{ models }` bodies without throwing on unexpected shapes
- [ ] [T08] Implement endpoint filtering: keep only `supported_endpoints.includes("/responses")`
- [ ] [T09] Implement `/models` request header set to match CLI pattern:
  - `Authorization: Bearer <token>`
  - `User-Agent: <non-empty>`
  - `Copilot-Integration-Id: copilot-developer-cli`
  - `X-GitHub-Api-Version: 2025-05-01`
  - `X-Interaction-Type: model-access`
  - `Openai-Intent: model-access`
  - `x-request-id: <uuid>`
- [ ] [T10] Implement mapping to opencode `Model` with required invariants:
  - `providerID: "copilot-responses"`
  - `api.npm: "@ai-sdk/openai"`
  - `api.url: baseUrl` (input)
  - `cost`: all zeros (including cache read/write)
  - `status`: `"beta"` when `preview: true`, else `"active"`
  - `capabilities`:
    - `reasoning: true` when `supports.max_thinking_budget` is defined
    - `attachment + input.image: true` when the model supports vision
    - `toolcall: true` when `supports.tool_calls` is true
  - `limit.context/output` mapped from `capabilities.limits.*` with safe defaults
  - `options`: include only fields we can support accurately (do **not** set `adaptiveThinking`)

---

- [ ] **COMMIT**: `feat: fetch and map copilot responses models`

#### Phase: REFACTOR

- [ ] [T11] Tighten types + defaults (no `any`, avoid `let`/`else`), and keep mapping logic in one place (`mapToOpencodeModel`)
- [ ] [T12] Remove duplication in tests with small helpers (model factory, server factory) without duplicating implementation logic

---

- [ ] **COMMIT**: `refactor: tighten responses model registry`

### Details

- [T00] Baseline must be green so any failures come from new RED tests.

- [T01-T02] File: `packages/opencode-copilot-responses/src/models/registry.test.ts`
  - Stand up `Bun.serve({ port: 0, fetch(req) { ... } })` and point `fetchModels({ baseUrl, token, fetch })` at it.
  - Assert request:
    - `GET /models`
    - required headers present and correct values where specified:
      - `authorization` starts with `Bearer `
      - `user-agent` is non-empty
      - `copilot-integration-id === "copilot-developer-cli"`
      - `x-github-api-version === "2025-05-01"`
      - `x-interaction-type === "model-access"`
      - `openai-intent === "model-access"`
      - `x-request-id` is present (assert non-empty; don’t assert exact UUID value)
  - Respond with `{ data: [...] }` containing three models:
    - one with `supported_endpoints: ["/chat/completions"]` (excluded)
    - one with `supported_endpoints: ["/responses"]` (included)
    - one with `supported_endpoints: ["/responses", "/chat/completions"]` (included)
  - Assert returned list length + IDs match only the included models.

- [T03] File: `packages/opencode-copilot-responses/src/models/registry.test.ts`
  - Reuse the same minimal `CopilotModel` object and return it as:
    - `CopilotModel[]`
    - `{ data: CopilotModel[] }`
    - `{ models: CopilotModel[] }`
  - Assert each case produces identical output from `fetchModels()`.

- [T04] File: `packages/opencode-copilot-responses/src/models/registry.test.ts`
  - Build two fixtures:
    - reasoning-capable: `capabilities.supports.max_thinking_budget` set
    - vision-capable: `capabilities.supports.vision: true` (and/or `capabilities.limits.vision` present)
  - Assert mapped `Model.capabilities` flags:
    - reasoning → `true` only for the reasoning fixture
    - attachment + input.image → `true` only for the vision fixture
  - Also assert invariants that must always hold:
    - `providerID === "copilot-responses"`
    - `api.npm === "@ai-sdk/openai"`
    - `api.url === baseUrl` provided to `fetchModels()`
    - `cost` is all zeros
    - `status` flips based on `preview`

- [T05] File: `packages/opencode-copilot-responses/src/models/registry.test.ts`
  - Add an inlined “real payload” fixture for gpt-5.3-codex (the `.opencode/reference/copilot-CLI-models-request.md` capture is intentionally untracked/unavailable in worktrees).
  - Assert `mapToOpencodeModel(gpt53, baseUrl)` equals a fully-specified expected `Model` object (not a partial match).
  - This test is what protects us from silently dropping fields or mis-mapping capability flags.

- [T06-T10] File: `packages/opencode-copilot-responses/src/models/registry.ts`
  - Shape to mirror the messages package registry but with Responses-specific differences:
    - filter constant: `const RESPONSES_ENDPOINT = "/responses"`
    - provider/api constants:
      - `providerID: "copilot-responses"`
      - `api.npm: "@ai-sdk/openai"`
      - `api.url: baseUrl` (do not hardcode)
    - headers must match CLI pattern for `/models` (this module should not rely on provider fetch interception).
  - Recommended structure (to keep logic readable and testable):
    - `function parseModels(value: unknown): CopilotModel[]`
    - `export function mapToOpencodeModel(model: CopilotModel, baseUrl: string): Model`
    - `export async function fetchModels(input: { token: string; baseUrl: string; fetch?: typeof fetch }): Promise<Model[]>`
  - Mapping rules:
    - `const caps = model.capabilities ?? {}`; `const limits = caps.limits ?? {}`; `const supports = caps.supports ?? {}`
    - `const vision = !!supports.vision`
    - `const reasoning = supports.max_thinking_budget !== undefined`
    - `limit.context` defaults to `200000` when missing; `limit.output` defaults to `16000` when missing
    - `options`: do **not** set `adaptiveThinking`; include only fields we have source data for (e.g., thinking budgets) and that opencode can represent without implying OpenAI-specific behavior

- [T11-T12] Keep refactors behavior-preserving:
  - No edits to RED tests after starting GREEN.
  - Prefer tiny helper functions over shared mutable state; keep naming single-word where possible.

- Verification (execute agent responsibility):
  - `cd packages/opencode-copilot-responses && bun test src/models/`
  - `cd packages/opencode-copilot-responses && bun test` (ensure no regressions)
