---
project: opencode-copilot-responses
type: task
title: Provider Module
description: Custom fetch interceptor with header injection and request analysis
number: 03
blockedBy: [01]
blocks: [04]
---

# Provider Module

## Goal

Implement the custom fetch interceptor that bridges between the AI SDK's request format and the Copilot API's requirements. This module handles header injection (authorization, Copilot-specific headers), request body analysis (initiator detection, vision detection), and `x-api-key` stripping. It is the runtime core of the plugin — every API request flows through this fetch function.

## Acceptance Criteria

This is done:

- when the custom fetch intercepts a request
  - given any outgoing request
    - then it strips the `x-api-key` header (the SDK sends this by default for OpenAI, but Copilot uses Bearer auth)
    - then it injects `Authorization: Bearer gho_<token>`
    - then it injects `Copilot-Integration-Id: copilot-developer-cli`
    - then it injects `X-GitHub-Api-Version: 2025-05-01`
    - then it injects `X-Interaction-Type: conversation-agent` and `Openai-Intent: conversation-agent`
    - then it injects `X-Interaction-Id: <uuid>` (per-request)
    - then it injects `x-request-id: <uuid>` (per-request)
    - then it preserves any pre-existing headers that don't conflict

- when `determineInitiator()` analyzes the Responses API body
  - given the last `input` item has `role: "user"` with text content
    - then it returns `"user"`
  - given the last `input` item is a `function_call_output`
    - then it returns `"agent"`
  - given no input items or the last item has no user role
    - then it returns `"agent"`

- when `hasImageContent()` analyzes the Responses API body
  - given an `input` item with content containing `type: "input_image"`
    - then it returns `true`
  - given no image content in any input items
    - then it returns `false`

- when vision content is detected
  - given `hasImageContent()` returns true
    - then the custom fetch injects `Copilot-Vision-Request: true`
  - given no vision content
    - then the header is omitted

- when the request is from an internal agent (e.g., title generation)
  - given the system/instructions field starts with known internal agent patterns
    - then `x-initiator` is set to `"agent"` regardless of message structure

- when a caller-supplied `x-initiator` header exists
  - given the `chat.headers` hook set `x-initiator: agent`
    - then the custom fetch preserves it (does not override)

### Verification Criteria

1. Run `bun test src/provider/` from the `packages/opencode-copilot-responses/` directory
2. All tests must pass with zero failures
3. Tests must use real `Bun.serve()` HTTP servers
4. Verify `x-api-key` is stripped from outgoing requests
5. Verify all Copilot headers are injected correctly
6. Verify initiator detection for: user text message (→ user), function_call_output (→ agent), empty input (→ agent), tool loop (→ agent)
7. Verify vision detection for: `input_image` content type (→ true), no images (→ false)
8. Verify `Copilot-Vision-Request` header is conditional on vision detection
9. Verify caller-supplied `x-initiator` is preserved
10. Verify internal agent detection (instructions/system prompt pattern matching)
11. Verify non-conflicting headers from the original request are preserved
12. Verify the fetch function handles malformed/unparseable bodies gracefully (default to agent initiator)

## Considerations

- **Responses API body format differs from Messages/Completions**: The Responses API uses `input` (not `messages`) as the conversation array. Items have types like `message`, `function_call`, `function_call_output`, `reasoning`. User messages have `role: "user"` with `content` arrays containing `{ type: "input_text" }` or `{ type: "input_image" }`. Reference: `.opencode/reference/copilot-CLI-responses-request.md` lines 36-141.

- **Initiator detection for Responses API**: The built-in copilot plugin (`plugin/copilot.ts` lines 70-100) already has Responses API detection:

  ```
  if (body?.input) {
    const last = body.input[body.input.length - 1]
    isAgent = last?.role !== "user"
    isVision = body.input.some(item => item?.content?.some(part => part.type === "input_image"))
  }
  ```

  Follow this pattern but ensure it handles edge cases (empty arrays, missing content).

- **No body rewriting needed**: Unlike the messages package, the Responses API body does not need rewriting for reasoning/effort. The `@ai-sdk/openai` SDK constructs the correct `reasoning: { effort, summary }` natively. The custom fetch only needs to inject headers, not modify the body.

- **Internal agent detection**: opencode has internal agents (e.g., title generator) that should be classified as agent-initiated. The messages package checks if the system prompt starts with `"You are a title generator"`. For the Responses API, the equivalent is checking the `instructions` field. Both string and array-of-blocks formats should be handled.

- **Header construction**: Create a `buildHeaders()` function similar to the messages package's `provider/headers.ts`. Accept a context object with the auth token, initiator, vision flag, and any caller-supplied headers. Return the complete header set.

- **Module structure**: Create `src/provider/` directory with: `fetch.ts` (main interceptor), `headers.ts` (header construction), `initiator.ts` (initiator + vision detection). No `stash.ts` needed (no stash mechanism).

- **Reference implementation**: `packages/opencode-copilot-messages/src/provider/` — same pattern but simpler (no stash, no body rewriting, different body format for initiator/vision detection).

- **TDD**: Write `fetch.test.ts` and `initiator.test.ts` (if separated) before implementation.

## Plan

### Checklist

[TBD — to be filled during planning phase]

### Details

[TBD — to be filled during planning phase]
