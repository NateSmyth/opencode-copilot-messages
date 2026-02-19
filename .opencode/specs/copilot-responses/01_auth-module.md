---
project: opencode-copilot-responses
type: task
title: Auth Module
description: OAuth device flow, entitlement check, and token storage
number: 01
blockedBy: []
blocks: [02, 03, 04]
---

# Auth Module

## Goal

Implement the authentication subsystem for the copilot-responses plugin. This includes the GitHub OAuth device code flow using the Copilot CLI client ID, an entitlement/base URL discovery step via `/copilot_internal/user`, and the stored auth type definitions. This module is the foundation for all other modules — models and provider depend on the auth token, and the plugin wires auth into hooks.

## Acceptance Criteria

This is done:

- when a consumer calls `authorizeDeviceCode()`
  - given a valid GitHub device code endpoint
    - then it POSTs to `/login/device/code` with the CLI client ID (`Ov23ctDVkRmgkPke0Mmm`) and `read:user` scope, and returns `{ device_code, user_code, verification_uri, expires_in, interval }`

- when a consumer calls `pollForToken()`
  - given the server returns `authorization_pending`
    - then it sleeps for the specified interval and retries
  - given the server returns `slow_down`
    - then it increases the polling interval per the server's instruction and retries
  - given the server returns `access_denied` or `expired_token`
    - then it throws an appropriate error
  - given the server returns an `access_token`
    - then it returns `{ access_token, token_type, scope }`

- when a consumer calls `fetchEntitlement()`
  - given a valid `gho_` token and the GitHub API endpoint
    - then it GETs `/copilot_internal/user` with `Authorization: Bearer gho_<token>`
    - then it returns `{ baseUrl, login }` extracted from the `endpoints.api` field of the response
  - given the endpoint returns a non-OK status
    - then it throws an error indicating the entitlement check failed

- when the `StoredAuth` type is used
  - given a successful auth flow
    - then it stores `{ type: "oauth", refresh: gho_token, access: gho_token, expires: 0, baseUrl: string }`

### Verification Criteria

1. Run `bun test src/auth/` from the `packages/opencode-copilot-responses/` directory
2. All tests must pass with zero failures
3. Tests must use real `Bun.serve()` HTTP servers — no mocking of fetch
4. Each function must be testable in isolation via injectable parameters (`fetch`, `url`, `clientId`, `scope`, `sleep`, `now`)
5. Verify that `authorizeDeviceCode` sends the correct client ID by asserting the request body received by the test server
6. Verify that `pollForToken` handles all four error/retry states
7. Verify that `fetchEntitlement` correctly extracts `endpoints.api` and converts to base URL
8. Verify that `fetchEntitlement` handles non-OK responses by throwing

## Considerations

- **Client ID**: Must be `Ov23ctDVkRmgkPke0Mmm` (Copilot CLI). This is NOT the VS Code client ID (`Iv1.b507a08c87ecfe98`) used by the messages package, nor opencode's built-in client ID (`Ov23li8tweQw6odWQebz`).

- **OAuth scope**: Start with `read:user`. The CLI uses `read:user,read:org,repo,gist` but we are cautious about requesting `repo` scope. If `read:user` proves insufficient during live testing (Task 05), we widen the scope. All scope configuration should be injectable/configurable.

- **No session token exchange**: Unlike the messages package, there is no `/copilot_internal/v2/token` exchange step. The `gho_` OAuth token is used directly as Bearer auth for all API calls. This eliminates the entire token refresh lifecycle.

- **Entitlement check doubles as base URL discovery**: The `GET /copilot_internal/user` endpoint serves two purposes — it validates that the user has an active Copilot subscription AND returns the per-user API base URL (`endpoints.api`). This base URL is cached in stored auth and reused on subsequent loads.

- **Reference**: The CLI auth flow is documented in `.opencode/reference/copilot-CLI-auth-flow.md` (Steps 1, 4-7). The entitlement response shows the `endpoints` object at lines 70-75.

- **Enterprise**: The entitlement check naturally returns enterprise-specific endpoints for enterprise users (the `endpoints.api` field reflects the user's account type). No special enterprise handling is needed at this layer — it's handled by the base URL being per-user.

- **Headers on entitlement check**: The reference shows the entitlement check uses `Authorization: Bearer gho_<token>` and minimal additional headers. Start with just auth + user-agent; widen if needed.

- **Module structure**: Create `src/auth/` directory with: `types.ts` (StoredAuth interface), `oauth.ts` (device flow), `entitlement.ts` (base URL discovery). Follow the messages package pattern of injectable dependencies for testability.

- **TDD**: Tests first. Write `oauth.test.ts` and `entitlement.test.ts` with `Bun.serve()` servers before implementation.

## Plan

### Checklist

- [x] [T00] Establish baseline: `cd packages/opencode-copilot-responses && bun test`

#### Phase: RED

- [x] [T01] Add RED tests for `authorizeDeviceCode()` request + response shape
- [x] [T02] Add RED tests for `pollForToken()` retry + error handling (`authorization_pending`, `slow_down`, `access_denied`, `expired_token`)
- [x] [T03] Add RED tests for `fetchEntitlement()` base URL extraction + non-OK error
- [x] [T04] Add RED tests for `StoredAuth` shape including `baseUrl`

---

- [x] **COMMIT**: `test: auth oauth device flow and entitlement`

#### Phase: GREEN

- [x] [T05] Implement `src/auth/oauth.ts` (`authorizeDeviceCode`, `pollForToken`) with injectable deps and form-encoded POST bodies
- [x] [T06] Implement `src/auth/entitlement.ts` (`fetchEntitlement`) with injectable deps and robust parsing
- [x] [T07] Implement `src/auth/types.ts` (`StoredAuth`) and export auth surface from `src/auth/index.ts`

---

- [x] **COMMIT**: `feat: add auth module oauth and entitlement`

#### Phase: REFACTOR

- [ ] [T08] Tighten error messages and edge-case handling without changing test intent (no test edits)
- [ ] [T09] Remove duplication between tests, standardize helpers, and ensure style-guide compliance (no `let`, avoid `else`)

---

- [ ] **COMMIT**: `refactor: tighten auth module and tests`

### Details

- [T00] Baseline must be green before writing RED tests so failures are attributable to new tests.

- [T01] File: `packages/opencode-copilot-responses/src/auth/oauth.test.ts`
  - Stand up a real HTTP server with `Bun.serve({ port: 0, fetch(req) { ... } })`.
  - Call `authorizeDeviceCode({ url, fetch, clientId, scope })` with `url` pointing at the test server.
  - Assert:
    - `POST /login/device/code`
    - body includes `client_id: "Ov23ctDVkRmgkPke0Mmm"` and `scope: "read:user"`
    - response JSON is returned verbatim as `{ device_code, user_code, verification_uri, expires_in, interval }`
  - Avoid encoding assumptions in tests by accepting either:
    - `application/x-www-form-urlencoded` (preferred), parsing via `new URLSearchParams(await req.text())`, or
    - JSON, parsing via `JSON.parse(await req.text())`.

- [T02] File: `packages/opencode-copilot-responses/src/auth/oauth.test.ts`
  - Use injected `sleep` to avoid real delays; record the requested milliseconds.
  - Use injected `now` to control time and avoid flakiness.
  - Server behavior per call count:
    - 1st call returns `{ error: "authorization_pending" }` → expect one sleep of `interval * 1000`, then retry.
    - 1st call returns `{ error: "slow_down", interval: <n> }` → expect sleep of `<n> * 1000` (fall back to `interval + 5` when `interval` missing), then retry.
    - Return `{ error: "access_denied" }` → expect `pollForToken()` rejects with an error containing `access_denied`.
    - Return `{ error: "expired_token" }` or time surpasses `expiresAt` → expect rejection containing `expired_token`.
    - Success returns `{ access_token, token_type, scope }`.

- [T03] Files:
  - `packages/opencode-copilot-responses/src/auth/entitlement.test.ts`
  - `packages/opencode-copilot-responses/src/auth/entitlement.ts`
  - Test server should assert `GET /copilot_internal/user` includes `Authorization: Bearer gho_<token>`.
  - Happy-path response fixture should include at minimum:
    - `login: "octocat"`
    - `endpoints: { api: "https://api.individual.githubcopilot.com" }`
  - `fetchEntitlement({ token, url, fetch })` returns `{ baseUrl: endpoints.api, login }`.
  - Non-OK response (e.g., 403/404/500) must throw an error that makes it clear entitlement failed and includes status.
  - Parse defensively: if `endpoints.api` is missing/empty, throw a clear error (this prevents later modules from silently using a bad base URL).

- [T04] File: `packages/opencode-copilot-responses/src/auth/types.ts`
  - Define `StoredAuth` to match persisted shape used by later tasks:
    - `{ type: "oauth", refresh: string, access: string, expires: 0, baseUrl: string }`.
  - Keep the type minimal (no methods). This task only defines the storage contract.

- [T05] File: `packages/opencode-copilot-responses/src/auth/oauth.ts`
  - Export `CLIENT_ID = "Ov23ctDVkRmgkPke0Mmm"`.
  - `authorizeDeviceCode(input?)`:
    - Injectables: `fetch`, `url` (default `https://github.com`), `clientId` (default `CLIENT_ID`), `scope` (default `read:user`).
    - POST to `/login/device/code`.
    - Prefer form encoding: `body: new URLSearchParams({ client_id, scope })` and `Content-Type: application/x-www-form-urlencoded`.
    - Always set `Accept: application/json`.
    - On non-OK: throw `Error` including status + pathname.
  - `pollForToken(input)`:
    - Inputs: `{ deviceCode, interval, expiresAt, fetch?, url?, clientId?, sleep?, now? }`.
    - POST to `/login/oauth/access_token` with form-encoded fields:
      - `client_id`, `device_code`, `grant_type: "urn:ietf:params:oauth:grant-type:device_code"`.
    - Retry behavior:
      - `authorization_pending` → sleep `interval` seconds and retry.
      - `slow_down` → increase delay (use `data.interval` when provided; otherwise `interval + 5`) and retry.
      - `access_denied` / `expired_token` → throw errors that preserve the error code string.
    - Expiration guard: if `Math.floor(now()/1000) >= expiresAt`, throw `expired_token`.

- [T06] File: `packages/opencode-copilot-responses/src/auth/entitlement.ts`
  - Function signature:
    - `export async function fetchEntitlement(input: { token: string; fetch?: typeof fetch; url?: string })`
  - Defaults: `url` defaults to `https://api.github.com`.
  - Request:
    - `GET /copilot_internal/user`
    - headers: `Authorization: Bearer ${token}`, `Accept: application/json` (and add a minimal `User-Agent` if needed later).
  - Response parsing:
    - `const api = data.endpoints?.api` → validate it’s a non-empty string.
    - return `{ baseUrl: api, login: data.login }`.

- [T07] Files:
  - `packages/opencode-copilot-responses/src/auth/index.ts` (barrel)
  - Ensure other tasks can import from `src/auth` without deep paths, e.g. `import { authorizeDeviceCode } from "./auth"`.

- [T08] Keep error strings stable enough for tests (assert on substrings like `access_denied`, `expired_token`). Avoid introducing custom error classes unless needed by later tasks.

- [T09] Test cleanup guidance:
  - Prefer small helper functions (e.g., `server()` factory) over shared mutable state.
  - Avoid `let` and `else`; use early returns and expression-based constants.
  - Don’t copy implementation parsing logic into tests; tests should validate observable behavior (requests made, retries/sleeps, thrown errors, returned shapes).
