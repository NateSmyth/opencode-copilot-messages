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

[TBD — to be filled during planning phase]

### Details

[TBD — to be filled during planning phase]
