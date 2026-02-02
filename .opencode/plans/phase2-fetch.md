# Phase 2.1: Custom Fetch Wrapper (Copilot Messages)

## Checklist

### Baseline
- [x] [T01] Verify baseline green in worktree (`bun test`, `bun run typecheck`, `bun run lint`)

### Phase: RED
- [x] [T02] Add `src/provider/fetch.test.ts` covering header injection, initiator parsing, and vision detection
---
- [ ] **COMMIT**: `test: cover copilot messages fetch wrapper`
- [x] **COMMIT**: `test: cover copilot messages fetch wrapper`
---

### Phase: GREEN
- [x] [T03] Implement `copilotMessagesFetch()` in `src/provider/fetch.ts` (strip x-api-key, inject Copilot headers, derive initiator + vision from body)
---
- [ ] **COMMIT**: `feat: implement copilot messages fetch wrapper`
---

### Phase: REFACTOR
- [ ] [T04] Tighten types and minimize parsing/merging duplication in `fetch.ts` + tests (no behavior change)
---
- [ ] **COMMIT**: `refactor: simplify copilot messages fetch wrapper`
---

## Summary

### Goal
Given an `@ai-sdk/anthropic` request to `/messages`, when the SDK calls our custom `fetch`, then we remove Anthropic’s `x-api-key`, inject Copilot-required headers, and set `x-initiator` / `Copilot-Vision-Request` based on the serialized request body.

### Pitfalls
- Avoid brittle tests that assert *every* header from `buildHeaders()` (we only need to validate key required ones + that injection occurred).
- Don’t consume non-rewindable request bodies; assume SDK sends JSON string body, but fall back safely if parsing fails.

## Details

### Primary sources
- Master plan: `/.opencode/plans/1769978081518-nimble-wolf.md`
- AI SDK Anthropic provider supports a custom `fetch(input, init?)` option (used as middleware): https://ai-sdk.dev/providers/ai-sdk-providers/anthropic

### Target code

File: `src/provider/fetch.ts`

Target export:

```ts
export async function copilotMessagesFetch(
  input: string | URL | Request,
  init: RequestInit | undefined,
  context: {
    sessionToken: string
    betaFeatures?: string[]
  }
): Promise<Response>
```

Notes:
- `copilotMessagesFetch()` must:
  1) Strip `x-api-key` from outgoing headers.
  2) Parse the outgoing request JSON body, extract `messages`, then:
     - `initiator = determineInitiator(messages)`
     - `hasImages = hasImageContent(messages)`
  3) Call `buildHeaders({ sessionToken, initiator, hasImages, betaFeatures })` and merge those headers into the request.

Dependencies (already implemented):
- `src/provider/headers.ts`: `buildHeaders(context)`
- `src/provider/initiator.ts`: `determineInitiator(messages)`, `hasImageContent(messages)`

### [T02] RED tests: `src/provider/fetch.test.ts`

Test harness strategy (no mocks):
- Use `Bun.serve()` to receive the outgoing request and assert on headers + body.
- Use a real `fetch()` call to the local server to exercise the wrapper end-to-end.

Test cases:

1) **Strips `x-api-key` and injects Copilot headers**
- Arrange: server asserts:
  - `req.headers.get("x-api-key") === null`
  - `req.headers.get("authorization") === "Bearer <session>"`
  - `req.headers.get("user-agent")` starts with `GitHubCopilotChat/` (proves `buildHeaders()` injection)
  - a caller-provided header (e.g. `x-keep: 1`) is still present
- Act: `copilotMessagesFetch(url, { method: "POST", headers: { "x-api-key": "k", "x-keep": "1", "content-type": "application/json" }, body }, { sessionToken })`
- Assert: response status ok.

2) **Derives `x-initiator: user` from body messages**
- Body: `{ messages: [{ role: "user", content: "hello" }] }`
- Server asserts: `req.headers.get("x-initiator") === "user"`.

3) **Derives `x-initiator: agent` when last block is `tool_result`**
- Body: `{ messages: [{ role: "user", content: [{ type: "text", text: "x" }, { type: "tool_result", content: [{ type: "text", text: "ok" }] }] }] }`
- Server asserts: `req.headers.get("x-initiator") === "agent"`.

4) **Sets `Copilot-Vision-Request: true` when images are present**
- Body includes an image block:
  - e.g. `{ messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: "image/png", data: "AA==" } }] }] }`
- Server asserts: `req.headers.get("Copilot-Vision-Request") === "true"`.

5) **No vision header when images absent**
- Body: `{ messages: [{ role: "user", content: "hello" }] }`
- Server asserts: `req.headers.get("Copilot-Vision-Request") === null`.

6) **Invalid / missing JSON body does not throw**
- Body: `"not-json"` (or omit `body`)
- Server asserts:
  - request still arrives
  - `x-initiator` defaults to `agent`

Expected outcomes:
- After [T02] (RED): new tests fail because `copilotMessagesFetch()` still throws `Not implemented`.

### [T03] GREEN implementation: `src/provider/fetch.ts`

Implementation steps:

1) Import helpers:
- `determineInitiator` and `hasImageContent` from `./initiator`

2) Merge headers correctly:
- Start with headers from `input` if it’s a `Request`.
- Overlay `init?.headers` (so SDK-provided headers win).
- Delete `x-api-key`.

3) Parse outgoing request body to get `messages`:
- Prefer `init?.body` when present; handle `string` and `Uint8Array`/`ArrayBuffer`.
- If body cannot be parsed as JSON or `messages` is missing, use `messages = []`.

4) Compute:
- `const initiator = determineInitiator(messages)`
- `const hasImages = hasImageContent(messages)`

5) Build Copilot headers and inject:
- `const copilot = buildHeaders({ sessionToken: context.sessionToken, initiator, hasImages, betaFeatures: context.betaFeatures })`
- For each `[key, value]`, `headers.set(key, value)`.

6) Call through:
- `return fetch(input, { ...init, headers })`

Acceptance criteria (matches tests):
- Removes `x-api-key`.
- Sets `authorization`, `x-initiator`, and conditionally `Copilot-Vision-Request`.
- Does not throw on missing/invalid body.

### [T04] REFACTOR

- Reduce exported surface area in `fetch.ts` to the minimal context shape needed for Phase 2.
- Keep parsing logic small and single-purpose (avoid introducing general helpers unless reused).
- Keep tests focused on end behavior (headers observed by server), not internal implementation.

## Verification

- [ ] All tests pass (`bun test`)
- [ ] No type errors (`bun run typecheck`)
- [ ] Lint clean (`bun run lint`)
