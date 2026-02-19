---
project: opencode-copilot-responses
type: task
title: Live Validation & Header Tuning
description: End-to-end testing against real Copilot API and header minimization
number: 05
blockedBy: [04]
blocks: []
---

# Live Validation & Header Tuning

## Goal

Validate the complete plugin against the real Copilot API. Confirm that authentication works, models are discoverable, gpt-5.3-codex is accessible, and streaming responses are received correctly. Empirically determine the minimum required header set by systematically removing headers and observing API behavior. Also validate that the `read:user` OAuth scope is sufficient.

## Acceptance Criteria

This is done:

- when the plugin is loaded by opencode
  - given a valid Copilot subscription and successful CLI-style OAuth
    - then the `copilot-responses` provider appears in the provider list
    - then models including gpt-5.3-codex appear in the model list

- when a request is made to gpt-5.3-codex
  - given a simple user prompt
    - then the request succeeds with a streaming response
    - then response text is received via SSE events
    - then the response completes without error

- when reasoning effort is configured
  - given a variant or explicit reasoning effort setting
    - then the request body includes `reasoning: { effort: "<value>" }`
    - then the model responds with reasoning content

- when tool calls are involved
  - given a prompt that triggers tool use
    - then the model returns function_call items
    - then tool results can be sent back as function_call_output
    - then the conversation continues correctly

- when the minimum header set is determined
  - given systematic removal of individual headers
    - then the minimum set required for successful requests is documented
    - then the plugin's header construction is updated to only include required headers

- when OAuth scope sufficiency is verified
  - given `read:user` scope
    - then all API endpoints work correctly (entitlement check, models, responses)
  - given scope is insufficient
    - then the required additional scopes are identified and documented

### Verification Criteria

1. Configure the plugin in opencode and authenticate via `opencode auth login`
2. Verify the model list includes gpt-5.3-codex and other `/responses` models
3. Send a test prompt to gpt-5.3-codex and verify streaming response
4. Test with reasoning effort variants (low, medium, high)
5. Test a prompt that triggers tool calls and verify the tool loop
6. Test with image input to verify vision header injection
7. Test in a subagent context to verify `x-initiator: agent` is set
8. Systematically remove headers one at a time and record which cause failures:
   - `Copilot-Integration-Id`
   - `X-GitHub-Api-Version`
   - `X-Interaction-Type`
   - `Openai-Intent`
   - `X-Interaction-Id`
   - `x-request-id`
   - User-Agent format variations
9. Document the minimum required header set
10. If `read:user` scope is insufficient, document which endpoint fails and what scope is needed
11. Update the plugin's header construction and OAuth config based on findings
12. Verify all unit tests still pass after any changes

## Considerations

- **This task is empirical**: Unlike the previous tasks which are primarily code-and-test, this task requires live API interaction. It cannot be fully automated and may require multiple iterations.

- **Header removal methodology**: Remove one header at a time. For each removal:
  1. Make a request to `/models` — does it succeed?
  2. Make a request to `/responses` with a simple prompt — does it succeed?
  3. Make a request to `/responses` that triggers tool use — does it succeed?
     If any fail, the header is required. If all succeed, it can be removed.

- **Scope validation**: If `read:user` is insufficient, the most likely candidates to add are `read:org` (for org-managed Copilot) or `repo` (for repository-context features). Start with the minimum and document exactly which API call fails.

- **Regression risk**: Any changes made during this task (header removal, scope changes) must not break existing unit tests. Run the full test suite after each change.

- **Rate limiting**: The Copilot API may have rate limits, especially for premium models like gpt-5.3-codex. Be mindful of quota consumption during testing.

- **API version sensitivity**: If `X-GitHub-Api-Version: 2025-05-01` causes issues, try `2025-10-01` (used by the messages package) as a fallback. Document which version works.

- **Documentation**: Results of this task should be captured as comments in the relevant source files and/or updated in the spec. The goal is to leave a clear record of why each header is or isn't included.

- **This task may reveal issues in earlier tasks**: If live testing exposes bugs in auth, models, or provider modules, fix them in-place with proper TDD (write a failing test first, then fix). Do not treat this as a separate debugging task — fixes should be atomic and committed immediately.

## Plan

### Checklist

[TBD — to be filled during planning phase]

### Details

[TBD — to be filled during planning phase]
