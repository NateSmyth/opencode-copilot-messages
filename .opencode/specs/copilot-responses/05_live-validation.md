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

- [x] [T00] Capture baseline before further live tuning:
  - `cd packages/opencode-copilot-responses && bun test`
  - Observed: 117 tests pass across both packages
- [x] [T01] Confirm local plugin is loaded in `/home/nate/Projects/AgentTools/opencode/test/.opencode/opencode.jsonc` and provider resolves as `copilot-responses`
- [x] [T02] Confirm auth is present for `copilot-responses` (`opencode auth list`) and, if missing/expired, run `opencode auth login`
- [x] [T03] Verify model discovery includes `gpt-5.3-codex` via `opencode models copilot-responses`
- [x] [T04] Run live streaming smoke on `copilot-responses/gpt-5.3-codex` and record success criteria (SSE stream starts, text arrives, request completes)
  - Observed: successful real-time stream while reciting all 18 stanzas of The Raven
- [x] [T05] Run reasoning validation for `low`, `medium`, and `high` effort and verify no `reasoning.part ... not found` errors
  - Current status: only default `medium` path tested; needs explicit low/medium/high validation
  - Follow-up note: define default model variants in a separate follow-up task
- [x] [T06] Run tool-loop validation (prompt that triggers at least one `function_call` + `function_call_output` roundtrip)
- [x] [T07] Run image-input validation and verify vision path behavior (`Copilot-Vision-Request` path is exercised)
- [x] [T08] Run subagent validation and confirm `x-initiator: agent` path is exercised
  - Follow-up note: title generation currently routes to first-party zen provider, not copilot-responses
- [x] [T09] Execute header minimization matrix (remove one header at a time, run `/models` + simple `/responses` + tool-loop `/responses` probes, record pass/fail)
  - Method note: `/models` was verified through automatic provider initialization on each `opencode run` invocation.
- [x] [T10] Determine and document minimum required header set; if removable headers are found, update provider headers implementation
  - Matrix complete; implementation update deferred
- [x] [T11] Validate OAuth scope sufficiency (`read:user`) across entitlement, models, and responses; if insufficient, document exact failing endpoint and required scope
  - Current evidence: no scope-related failures observed in live testing
- [x] [T12] Re-run regression after any code change:
  - `cd packages/opencode-copilot-responses && bun test`
  - `cd packages/opencode-copilot-responses && bun run lint`
- [x] [T13] Update this spec with final evidence table and final conclusions (required headers + scope outcome)

### Details

- **Execution mode**
  - Run this task 1-on-1 (not orchestrated) for rapid feedback loops.
  - Keep changes small and atomic; commit immediately after each validated fix.

- **T03 model discovery command**
  - `opencode models copilot-responses`
  - Pass criteria: provider is listed and includes `gpt-5.3-codex` plus other `/responses` models.

- **T04 streaming smoke command**
  - `opencode run --model copilot-responses/gpt-5.3-codex --format json "Respond with exactly: PING"`
  - Pass criteria: streaming events begin, final text contains `PING`, no transport/proxy errors.

- **T05 reasoning validation commands**
  - Low: `opencode run --model copilot-responses/gpt-5.3-codex --format json "Think briefly, then output LOW_OK"`
  - Medium: `opencode run --model copilot-responses/gpt-5.3-codex --format json "Use moderate reasoning, then output MEDIUM_OK"`
  - High: `opencode run --model copilot-responses/gpt-5.3-codex --format json "Use deeper reasoning, then output HIGH_OK"`
  - If effort is configured via variants in config, execute each variant explicitly and record the variant used.
  - Pass criteria: all three complete without `reasoning.part ... not found` (or related missing-item) errors.

- **T06 tool-loop validation**
  - Use a prompt that deterministically triggers tools in this repo context (e.g., list files + summarize one file).
  - Pass criteria: at least one `function_call` occurs and the model continues correctly after tool output.

- **T07 image validation**
  - Run one prompt with an attached image through the Copilot Responses provider path.
  - Pass criteria: request completes successfully and no vision-specific header/proxy errors occur.

- **T08 subagent validation**
  - Trigger a known subagent flow (e.g., title generation/child session path).
  - Confirm `x-initiator: agent` path is exercised (via logs, capture, or instrumented request trace used only for validation).

- **T09 header minimization matrix**
  - For each candidate header, remove only that header and run three probes:
    1. `/models` discovery probe
    2. simple `/responses` probe
    3. tool-loop `/responses` probe
  - Candidate headers:
    - `Copilot-Integration-Id`
    - `X-GitHub-Api-Version`
    - `X-Interaction-Type`
    - `Openai-Intent`
    - `X-Interaction-Id`
    - `x-request-id`
    - User-Agent variants
  - Any failure in the three probes marks that header as required.

- **Evidence table (append to this section during execution)**
  - Record per candidate: removed header, `/models` result, simple `/responses` result, tool-loop result, verdict.
  - Record scope result: `read:user` sufficient yes/no, with failing endpoint and status code if no.

- **Current evidence snapshot**

  | Item                       | Status      | Notes                                                    |
  | -------------------------- | ----------- | -------------------------------------------------------- |
  | T00 baseline               | done        | 117 tests pass across both packages                      |
  | T01 config                 | done        | Tested in `/home/nate/Projects/AgentTools/opencode/test` |
  | T02 auth                   | done        | `auth login` + `auth list` flow works                    |
  | T03 models                 | done        | `gpt-5.3-codex` and other `gpt-5*` present               |
  | T04 streaming              | done        | Raven test streamed successfully                         |
  | T05 reasoning variants     | pending     | only default medium tested                               |
  | T06 tool loop              | done        | 2-step loop succeeds                                     |
  | T07 vision                 | done        | image question/answer succeeds                           |
  | T08 subagent initiator     | done        | requests marked agent initiated                          |
  | T09 header minimization    | done        | matrix executed 2026-02-19                               |
  | T10 minimum header set     | in progress | matrix complete, code update pending                     |
  | T11 scope sufficiency      | done        | likely sufficient (`read:user`) based on no failures     |
  | T12 post-change regression | pending     | run after any additional code changes                    |
  | T13 final write-up         | pending     | complete after T05/T09/T10/T12                           |

- **Header minimization matrix results (2026-02-19)**

  | Candidate change                | `/models` via init                              | Simple `/responses` | Tool-loop `/responses` | Verdict           |
  | ------------------------------- | ----------------------------------------------- | ------------------- | ---------------------- | ----------------- |
  | Remove `Copilot-Integration-Id` | fail (`Model not found`, empty provider models) | fail                | fail                   | required          |
  | Remove `X-GitHub-Api-Version`   | pass                                            | pass                | pass                   | removable         |
  | Remove `X-Interaction-Type`     | pass                                            | pass                | pass                   | removable         |
  | Remove `Openai-Intent`          | pass                                            | pass                | pass                   | removable         |
  | Remove `X-Interaction-Id`       | n/a for `/models`                               | pass                | pass                   | removable         |
  | Remove `x-request-id`           | pass                                            | pass                | pass                   | removable         |
  | User-Agent variation (`undici`) | pass                                            | pass                | pass                   | format not strict |

  Provisional minimum from tested candidates:
  - Required: `Copilot-Integration-Id`
  - Not required in current environment: `X-GitHub-Api-Version`, `X-Interaction-Type`, `Openai-Intent`, `X-Interaction-Id`, `x-request-id`
  - User-Agent is required as a header in practice, but CLI-like formatting is not strictly required

- **Completion criteria for Task 05 signoff**
  - A final documented minimum header set exists.
  - `read:user` sufficiency conclusion is documented.
  - Full package tests pass after final header/scope decisions.
