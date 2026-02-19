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
8. Compare a mapped model against the expected shape using a full model from the reference material (e.g., gpt-5.3-codex from `.opencode/reference/copilot-CLI-models-request.md`)

## Considerations

- **Endpoint filter value**: The filter value is `"/responses"` (no `/v1/` prefix). This is confirmed by the `/models` response in the reference material, which shows `supported_endpoints: ["/responses"]` for gpt-5.3-codex.

- **API URL in model**: Each mapped model's `api.url` should be the base URL from auth (e.g., `https://api.individual.githubcopilot.com`), NOT a hardcoded value. This is passed as input to `fetchModels()`.

- **Headers on /models request**: Match the CLI pattern. Required headers include `Authorization`, `Copilot-Integration-Id: copilot-developer-cli`, `X-GitHub-Api-Version: 2025-05-01`, `X-Interaction-Type: model-access`, `Openai-Intent: model-access`, `x-request-id: <uuid>`. Reference: `.opencode/reference/copilot-CLI-models-request.md` lines 9-26.

- **CopilotModel interface**: Define an interface matching the model shape from the `/models` response. Key fields: `id`, `name`, `vendor`, `preview`, `capabilities.limits` (context window, output, prompt tokens, vision), `capabilities.supports` (streaming, tool_calls, vision, parallel_tool_calls, structured_outputs), `supported_endpoints`. Reference: `.opencode/reference/copilot-CLI-models-request.md` lines 47-273.

- **No `adaptive_thinking` in Responses models**: Unlike the Anthropic models in the messages package, OpenAI Responses models use `reasoning.effort` natively via the SDK. The model metadata should NOT set `options.adaptiveThinking`. Instead, reasoning capability is indicated by `capabilities.reasoning: true` and opencode's variant system handles the rest through `providerOptions.openai.reasoningEffort`.

- **Reference implementation**: `packages/opencode-copilot-messages/src/models/registry.ts` — same pattern but with different provider ID, npm package, API URL, and endpoint filter.

- **TDD**: Write `registry.test.ts` with mock `/models` responses before implementation.

## Plan

### Checklist

[TBD — to be filled during planning phase]

### Details

[TBD — to be filled during planning phase]
