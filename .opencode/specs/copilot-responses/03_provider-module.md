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

- [x] [T00] Establish baseline: `cd packages/opencode-copilot-responses && bun test`

#### Phase: RED

- [x] [T01] Add RED tests for `copilotResponsesFetch()` stripping `x-api-key` and injecting required Copilot headers
- [x] [T02] Add RED tests for `determineInitiator()` (user text → user, function_call_output → agent, empty → agent)
- [x] [T03] Add RED tests for `hasImageContent()` (input_image → true, no images → false)
- [x] [T04] Add RED tests for internal agent detection via `instructions`/`system` prefix forcing `x-initiator: agent`
- [x] [T05] Add RED tests that caller-supplied `x-initiator` is preserved and non-conflicting headers are preserved
- [x] [T06] Add RED test that malformed/unparseable bodies do not throw and default initiator to agent

---

- [ ] **COMMIT**: `test: provider fetch header injection and request analysis`

#### Phase: GREEN

- [ ] [T07] Implement `src/provider/initiator.ts` (`determineInitiator`, `hasImageContent`) for Responses API request bodies
- [ ] [T08] Implement `src/provider/headers.ts` (`buildHeaders`) for the Copilot CLI header set
- [ ] [T09] Implement `src/provider/fetch.ts` (`copilotResponsesFetch`) to merge headers, strip `x-api-key`, derive initiator/vision, and inject headers

---

- [ ] **COMMIT**: `feat: add copilot responses provider fetch interceptor`

#### Phase: REFACTOR

- [ ] [T10] Tighten parsing + edge cases (missing/odd shapes) without changing test intent (no test edits)
- [ ] [T11] Remove duplication in tests and ensure style-guide compliance (no `let`, avoid `else`, avoid unnecessary destructuring)

---

- [ ] **COMMIT**: `refactor: tighten provider module and tests`

### Details

- [T00] Baseline must be green so new failures are attributable to new RED tests.

- [T01] File: `packages/opencode-copilot-responses/src/provider/fetch.test.ts`
  - Stand up a real `Bun.serve({ port: 0, fetch(req) { ... } })` server.
  - Call `copilotResponsesFetch(url, init, { token: "gho_test" })` and assert the server receives:
    - `x-api-key` is stripped (`req.headers.get("x-api-key") === null`).
    - `authorization: Bearer gho_test`.
    - `copilot-integration-id: copilot-developer-cli`.
    - `x-github-api-version: 2025-05-01`.
    - `x-interaction-type: conversation-agent` and `openai-intent: conversation-agent`.
    - `x-interaction-id` is present and matches UUID format.
    - `x-request-id` is present and matches UUID format.
  - Also verify a random caller header (e.g. `x-keep: 1`) is preserved.
  - For per-request UUIDs, either:
    - assert they match a UUID regex, or
    - send two requests and assert the values differ between requests.

- [T02] File: `packages/opencode-copilot-responses/src/provider/initiator.test.ts`
  - Test `determineInitiator(input)` directly (pure function, no mocks):
    - last `input` item `{ role: "user", content: [{ type: "input_text", text: "hi" }] }` → `"user"`.
    - last `input` item `{ type: "function_call_output", ... }` → `"agent"`.
    - `[]` → `"agent"`.
  - Add one edge-case assertion: missing/empty `content` on a user item → `"agent"`.

- [T03] File: `packages/opencode-copilot-responses/src/provider/initiator.test.ts`
  - Test `hasImageContent(input)` directly:
    - any input item with `content` containing `{ type: "input_image" }` → `true`.
    - no `input_image` in any item → `false`.

- [T04] File: `packages/opencode-copilot-responses/src/provider/fetch.test.ts`
  - Provide a request body fixture with internal-agent instructions (title generation):
    - `instructions: "You are a title generator. ..."` forces `x-initiator: agent`.
    - `instructions: [{ type: "text", text: "You are a title generator. ..." }]` also forces agent.
  - Also accept `system` as a fallback field (some callers may use it); implement the check as `instructions ?? system`.

- [T05] File: `packages/opencode-copilot-responses/src/provider/fetch.test.ts`
  - Caller-supplied `x-initiator`:
    - send request with header `x-initiator: agent` and a user-looking body; assert it remains `agent`.
  - Preserve non-conflicting headers:
    - send `content-type`, `x-keep`, etc.; assert they reach the server unchanged.
  - Conflicts:
    - show that required Copilot headers win when present in the original request (e.g., original `authorization` overwritten).

- [T06] File: `packages/opencode-copilot-responses/src/provider/fetch.test.ts`
  - Pass `body: "not-json"` with `content-type: application/json`.
  - Assert the request still succeeds and `x-initiator` defaults to `agent`.

- [T07] File: `packages/opencode-copilot-responses/src/provider/initiator.ts`
  - Export:
    - `determineInitiator(input: unknown): "user" | "agent"`
    - `hasImageContent(input: unknown): boolean`
  - Implementation rules (robust, schema-light):
    - `determineInitiator`:
      - if `input` is not an array or is empty → `agent`.
      - if last item has `type: "function_call_output"` → `agent`.
      - if last item has `role: "user"` and has a text part (string content or `content[]` with last/any `{ type: "input_text" }`) → `user`.
      - otherwise → `agent`.
    - `hasImageContent`:
      - walk all array items; if any has `content[]` with `{ type: "input_image" }` → `true`; else `false`.

- [T08] File: `packages/opencode-copilot-responses/src/provider/headers.ts`
  - Export `buildHeaders(context)` returning a `Record<string, string>`.
  - Context fields:
    - `token: string`
    - `initiator: "user" | "agent"`
    - `hasImages?: boolean`
  - Must set (minimum):
    - `Authorization: Bearer gho_<token>`
    - `Copilot-Integration-Id: copilot-developer-cli`
    - `X-GitHub-Api-Version: 2025-05-01`
    - `X-Interaction-Type: conversation-agent`
    - `Openai-Intent: conversation-agent`
    - `X-Interaction-Id: <uuid>`
    - `x-request-id: <uuid>`
    - `x-initiator: <initiator>`
    - conditional: `Copilot-Vision-Request: true` only when `hasImages === true`

- [T09] File: `packages/opencode-copilot-responses/src/provider/fetch.ts`
  - Export `copilotResponsesFetch(input, init, context)` (messages package pattern):
    - `context: { token: string }`
    - merge headers from `input` (when `Request`) and `init.headers` (init wins).
    - strip `x-api-key`.
    - parse body for analysis only (never rewrite):
      - handle `init.body` as string/ArrayBuffer/ArrayBufferView; otherwise skip analysis.
      - on JSON parse failure, treat as empty input.
    - determine initiator:
      - if caller supplied valid `x-initiator`, keep it.
      - else if internal agent detected from `instructions`/`system` prefix, use `agent`.
      - else derive from `determineInitiator(body.input)`.
    - derive vision from `hasImageContent(body.input)`.
    - inject headers from `buildHeaders({ token, initiator, hasImages })` via `headers.set()` (required headers override conflicts).
    - call through to global `fetch(input, { ...init, headers })`.

- [T10] Keep test intent stable; only change implementation. Focus areas:
  - allow `instructions` and `system` to be either a string or an array of blocks containing `{ type: "text", text: string }`.
  - default behavior for unknown/malformed shapes remains: `x-initiator: agent`, no vision header.

- [T11] Test hygiene:
  - prefer small helpers for server setup and UUID assertions.
  - don’t duplicate implementation traversal logic in tests; validate observable behavior (headers on the received request).
  - keep each test asserting one behavioral rule from Acceptance Criteria.
