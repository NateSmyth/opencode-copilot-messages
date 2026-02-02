# Phase 1: Auth Foundation (Device OAuth + Session Token Exchange)

## Checklist

### Baseline
- [x] [T01] Verify baseline green in worktree (`bun test`, `bun run typecheck`)

### Phase: RED (Device Code OAuth)
- [x] [T02] Add device-code OAuth tests for request shape + polling state handling
---
- [ ] **COMMIT**: `test: cover device code oauth flow states`
---

### Phase: GREEN (Device Code OAuth)
- [x] [T03] Implement `authorizeDeviceCode()` and `pollForToken()` with injectable `fetch/sleep/now`
---
- [ ] **COMMIT**: `feat: implement device code oauth flow`
---

### Phase: REFACTOR (Device Code OAuth)
- [x] [T04] Tighten errors/types and remove duplication in oauth tests
---
- [ ] **COMMIT**: `refactor: harden oauth flow and tests`
---

### Phase: RED (Session Token Exchange)
- [x] [T05] Add session token exchange/refresh tests (clock skew, refresh window)
---
- [ ] **COMMIT**: `test: cover session token exchange and refresh logic`
---

### Phase: GREEN (Session Token Exchange)
- [x] [T06] Implement `exchangeForSessionToken()`, `shouldRefreshToken()`, and `refreshSessionToken()`
---
- [ ] **COMMIT**: `feat: implement copilot session token exchange`
---

### Phase: REFACTOR (Session Token Exchange)
- [ ] [T07] Simplify token module surface, normalize error messages, and finalize exports
---
- [ ] **COMMIT**: `refactor: polish token exchange module`
---

## Summary

### Goal
Given a GitHub OAuth device-code flow and a GitHub token, when we request a device code, poll for access, and exchange for a Copilot session token, then we reliably obtain/refresh a session token with correct polling/expiry behavior.

## Details

### Baseline
- [T01] Run:
  - `bun test`
  - `bun run typecheck`

### Device Code OAuth Flow (src/auth/oauth.ts)

**Primary sources:** GitHub OAuth device flow docs (device code request + polling + error states)\
https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow

#### Target exports and signatures

File: `src/auth/oauth.ts`

```ts
export async function authorizeDeviceCode(input?: {
	fetch?: typeof fetch
	url?: string
	clientId?: string
	scope?: string
}): Promise<DeviceCodeResponse>

export async function pollForToken(input: {
	deviceCode: string
	interval: number
	expiresAt: number // unix seconds
	fetch?: typeof fetch
	url?: string
	clientId?: string
	sleep?: (ms: number) => Promise<void>
	now?: () => number // ms
}): Promise<TokenResponse>
```

Notes:
- Default `clientId` is `CLIENT_ID`.
- Default `scope` is `read:user`.
- `authorizeDeviceCode()` POSTs to `https://github.com/login/device/code`.
- `pollForToken()` POSTs to `https://github.com/login/oauth/access_token` and loops until success or terminal error.

#### RED tests

Add: `src/auth/oauth.test.ts`

Test harness strategy (avoid real network):
- Use `Bun.serve()` to host local endpoints; pass `url` + `fetch` overrides to functions.
- Inject `sleep` that records delays and resolves immediately.

Exact test cases:

1) `authorizeDeviceCode()` sends required form fields
- Arrange: local server endpoint `/login/device/code` that asserts:
  - method is POST
  - content-type includes `application/x-www-form-urlencoded`
  - parsed body includes `client_id === CLIENT_ID` and `scope === "read:user"`
  - header `Accept` includes `application/json`
- Respond with JSON matching `DeviceCodeResponse`.
- Assert: return value matches response.

2) `pollForToken()` retries on `authorization_pending` then returns token
- Arrange: local server endpoint `/login/oauth/access_token` that returns:
  - call #1: `{ error: "authorization_pending", error_description: "..." }`
  - call #2: `{ access_token: "gho_x", token_type: "bearer", scope: "read:user" }`
- Act: call `pollForToken({ deviceCode, interval: 1, expiresAt: now+60, sleep, now, url, fetch })`.
- Assert:
  - returns token response
  - `sleep` called exactly once with `1000` (interval seconds)

3) `pollForToken()` applies `slow_down` by increasing the delay
- Arrange sequence:
  - call #1: `{ error: "slow_down", interval: 6 }`
  - call #2: success token
- Assert:
  - `sleep` first call is `6000` (prefer response `interval` when present)

4) `pollForToken()` throws on `access_denied`
- Arrange: response `{ error: "access_denied" }`.
- Assert: promise rejects; error message contains `access_denied`.

5) `pollForToken()` throws on `expired_token`
- Arrange: response `{ error: "expired_token" }`.
- Assert: promise rejects; error message contains `expired_token`.

Expected test counts:
- After [T02] (RED): baseline 1 + oauth 5 = **6 total** (expect **1 pass**, **5 fail** until implementation)

#### GREEN implementation steps

6) Add runtime stubs (if needed to make tests execute) that throw `Error("TODO")` for missing exports.

7) Implement `authorizeDeviceCode()`
- Build `URLSearchParams` body:
  - `client_id` (default `CLIENT_ID`)
  - `scope` (default `read:user`)
- `fetch(url, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body })`
- If `!res.ok`, read `await res.text()` and throw `Error` including status and snippet.
- Parse JSON and return as `DeviceCodeResponse`.

8) Implement `pollForToken()`
- Compute `nowSeconds = Math.floor((now ?? Date.now)() / 1000)`.
- Loop while `nowSeconds < input.expiresAt`:
  - POST x-www-form-urlencoded body with:
    - `client_id`
    - `device_code`
    - `grant_type = "urn:ietf:params:oauth:grant-type:device_code"`
  - If response JSON has `access_token`, return `TokenResponse`.
  - If response JSON has `error`:
    - `authorization_pending`: `await sleep(interval*1000)` and continue.
    - `slow_down`: set `interval = response.interval ?? (interval + 5)` (GitHub states it adds 5 seconds) then `await sleep(interval*1000)`.
    - `expired_token` / `access_denied`: throw `Error` with the code.
    - otherwise: throw `Error` containing `error` and (if present) `error_description`.
  - Recompute `nowSeconds` each iteration.
- If loop exits due to time, throw `Error("expired_token")`.

Expected test counts:
- After [T03] (GREEN): **6 total**, expect **6 pass**.

#### REFACTOR

9) Remove any extra scaffolding, keep surface minimal, and normalize error creation.
10) Keep logic in the two exported functions unless a helper is clearly reused.

### Session Token Exchange (src/auth/token.ts)

#### Target exports and signatures

File: `src/auth/token.ts`

```ts
export async function exchangeForSessionToken(input: {
	githubToken: string
	fetch?: typeof fetch
	url?: string
	now?: () => number // ms
}): Promise<SessionToken>

export function shouldRefreshToken(input: {
	expiresAt: number
	now?: () => number // ms
}): boolean

export async function refreshSessionToken(input: {
	githubToken: string
	token: SessionToken
	fetch?: typeof fetch
	url?: string
	now?: () => number // ms
}): Promise<SessionToken>
```

Notes:
- `exchangeForSessionToken()` POSTs to `https://api.github.com/copilot_internal/v2/token`.
- Uses header `Authorization: token ${githubToken}` (not Bearer) and `X-GitHub-Api-Version: 2025-04-01` (from master plan).
- Clock skew handling: `expiresAt = nowSeconds + refresh_in + 60` (override server `expires_at`).
- Refresh window: within 5 minutes of expiry (`<= nowSeconds + 300`).

#### RED tests

Add: `src/auth/token.test.ts`

Test harness strategy:
- Use `Bun.serve()` local endpoint `/copilot_internal/v2/token`.
- Verify request headers and return deterministic `TokenEnvelope`.
- Inject `now()` to make expiry math deterministic.

Exact test cases:

1) `exchangeForSessionToken()` sends required headers and adjusts expiry from `refresh_in`
- Arrange: server asserts headers:
  - `authorization === "token ghp_test"`
  - `x-github-api-version === "2025-04-01"`
  - `accept` includes `application/json`
- Respond: `{ token: "tid=1;exp=999:mac", expires_at: 999, refresh_in: 120 }`
- Act: `now = () => 1_700_000_000_000` (ms) => `nowSeconds = 1700000000`
- Assert: returned `expiresAt === 1700000000 + 120 + 60` and `refreshIn === 120` and `token` matches.

2) `shouldRefreshToken()` returns false when outside 5-minute window
- `expiresAt = nowSeconds + 301` => expect false.

3) `shouldRefreshToken()` returns true at/inside 5-minute window
- `expiresAt = nowSeconds + 300` => expect true.
- `expiresAt = nowSeconds + 1` => expect true.

4) `refreshSessionToken()` returns same token when not due (no HTTP call)
- Pass `fetch` that throws if called.
- Assert: returns original token.

5) `refreshSessionToken()` exchanges when due
- Provide local server and `token.expiresAt = nowSeconds + 1`.
- Assert: returns new token from server.

Expected test counts:
- After [T05] (RED): baseline 1 + oauth 5 + token 5 = **11 total** (expect **6 pass**, **5 fail** until implementation)

#### GREEN implementation steps

11) Implement `exchangeForSessionToken()`
- `fetch(url, { method: "POST", headers: { Authorization: `token ${githubToken}`, Accept: "application/json", "X-GitHub-Api-Version": "2025-04-01" } })`
- If `!res.ok`, throw with status and response text.
- Parse JSON as `TokenEnvelope`.
- Compute `nowSeconds` and set:
  - `expiresAt = nowSeconds + envelope.refresh_in + 60`
  - `refreshIn = envelope.refresh_in`
  - `token = envelope.token`
- Return `SessionToken`.

12) Implement `shouldRefreshToken()`
- `nowSeconds = Math.floor((now ?? Date.now)() / 1000)`
- Return `expiresAt <= nowSeconds + 300`.

13) Implement `refreshSessionToken()`
- If `!shouldRefreshToken({ expiresAt: input.token.expiresAt, now: input.now })`, return `input.token`.
- Otherwise, return `exchangeForSessionToken({ githubToken: input.githubToken, fetch: input.fetch, url: input.url, now: input.now })`.

Expected test counts:
- After [T06] (GREEN): **11 total**, expect **11 pass**.

#### REFACTOR

14) Ensure all public exports match the phase needs (no unused TODO exports).
15) Ensure errors are stable and contain only minimal, useful context (status + endpoint + error code).

## Verification

- [ ] `bun test`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
