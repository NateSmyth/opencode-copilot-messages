# Adaptive Thinking Stash Swap Refactor

## Checklist

### Phase: BASELINE

- [x] [T00] Verify baseline passes on branch/worktree

---

### Phase: RED

- [x] [T01] Update `src/plugin.test.ts` to cover forward-compat detect/stash/swap in `chat.params`/`chat.headers`
- [x] [T02] Add end-to-end test for stash-driven fetch swap (stash header → outgoing `/v1/messages` body)
- [x] [T03] Update `src/provider/fetch.test.ts` for swap semantics (no output_config merge)

---

- [x] **COMMIT**: `test: cover adaptive stash swap`

---

### Phase: GREEN

- [x] [T04] Implement shared stash store + token plumbing
- [x] [T05] Refactor `src/plugin.ts` to detect/stash/swap and simplify effort remap
- [x] [T06] Refactor `src/provider/fetch.ts` to swap stashed config into request body

---

- [x] **COMMIT**: `refactor: swap adaptive config via stash token`

---

### Phase: REFACTOR

- [x] [T07] Cleanup: tighten types/guards, remove dead tests/branches, keep naming/style consistent

---

- [x] **COMMIT**: `refactor: simplify adaptive stash plumbing`

## Summary

### Goal

Given user config that is valid for the current Anthropic API / ai-sdk v3 (notably `thinking: { type: "adaptive" }` and/or `effort: "max"`) but rejected by our pinned legacy SDK (`@ai-sdk/anthropic@2.0.58`), when OpenCode runs `chat.params → chat.headers → fetch`, then we (1) swap in SDK-safe options so the legacy SDK accepts the request, and (2) swap the **literal user config** back into the outgoing `/v1/messages` JSON body—without heuristic inference or field-level merging.

### Pitfalls

- Only shim the two explicit forward-compat cases (`thinking.type === "adaptive"`, `effort === "max"`). Everything else must be left to the SDK to reject.
- Avoid cross-request leakage: the stash must be one-time consumable and must not rely on variant-name inference.

## Details

### Design

**Separate concerns**:

1. **Built-in variant remap** (UX alignment): variant names `high` / `max` map to an internal effort signal (`x-adaptive-effort`).
2. **Forward-compat shim** (SDK pinned): if user provides values the legacy SDK rejects, temporarily swap options to legacy-safe values, and restore user intent only at the HTTP boundary.

**Full swap (not merge)**:

- When applying stashed values, we *replace* `thinking` and/or `output_config` in the outgoing JSON body, rather than selectively mutating fields.

### Plumbing choices

- Add header: `x-adaptive-stash: <uuid>` as the fetch-layer signal.
- Store stashed values in a shared in-process Map keyed by `<uuid>`.
  - `put(token, { thinking, effort })`
  - `take(token)` returns stash and deletes it (one-time).

> Note: headers must not contain the user config itself—only an opaque token.

### [T00] Verify baseline passes on branch/worktree

- Worktree: `/home/nate/Projects/AgentTools/opencode/opencode-copilot-messages/.worktrees/adaptive-stash-refactor`
- Run:
  - `bun test`
  - `bun run typecheck`
  - `bun run lint`

### [T01] Update `src/plugin.test.ts` to cover forward-compat detect/stash/swap

File: `src/plugin.test.ts`

Add new tests (or extend existing adaptive tests) asserting:

- If `output.options.thinking = { type: "adaptive" }`:
  - `chat.params` swaps to `{ type: "enabled", budgetTokens: 1024 }`
  - `chat.headers` emits `x-adaptive-stash` (string UUID)
- If `output.options.effort = "max"`:
  - `chat.params` deletes `output.options.effort`
  - `chat.params` ensures `output.options.thinking` is set to `{ type: "enabled", budgetTokens: 1024 }` (to keep legacy SDK happy)
  - `chat.headers` emits `x-adaptive-stash`
- If no forward-compat values are present:
  - no `x-adaptive-stash` is emitted

Verification for T01:

- Run `bun test src/plugin.test.ts` and confirm new tests fail (RED) on current implementation.

### [T02] Add end-to-end test for stash-driven fetch swap

File: `src/plugin.test.ts` (fits existing end-to-end pattern capturing `/v1/messages`)

Test outline:

1. Create hooks via `CopilotMessagesPlugin(...)`.
2. Call `chat.params` with forward-compat user config to trigger stash + swap.
3. Call `chat.headers` and capture `x-adaptive-stash`.
4. Send a request through the wired `fetch` (from `auth.loader`) *or* call `copilotMessagesFetch` directly, with:
   - body representing the **SDK-generated** request after swap:
     - `thinking: { type: "enabled", budget_tokens: 1024 }`
   - header `x-adaptive-stash: <token>`
5. Assert server receives:
   - `thinking` replaced with stashed user thinking (e.g. `{ type: "adaptive" }`)
   - `output_config` replaced with stashed effort when present (e.g. `{ effort: "max" }`)
   - outgoing headers do **not** include `x-adaptive-stash`

Verification for T02:

- Run `bun test src/plugin.test.ts` and confirm the new end-to-end test fails (RED) before implementation.

### [T03] Update `src/provider/fetch.test.ts` for swap semantics

File: `src/provider/fetch.test.ts`

Changes:

- Keep coverage that `x-adaptive-effort` rewrites outgoing JSON.
- Update/remove: “preserves existing output_config fields during rewrite”. With full swap, `output_config` becomes `{ effort }`.
- Add: stash-driven rewrite path:
  - when `x-adaptive-stash` is set (and token exists), rewrite happens even if `x-adaptive-effort` is absent.

Verification for T03:

- Run `bun test src/provider/fetch.test.ts` and confirm failures match expected (RED).

### [T04] Implement shared stash store + token plumbing

Add file: `src/provider/stash.ts` (or `src/stash.ts`; pick a neutral location to avoid import cycles)

Exports (suggested):

- `export function put(token: string, value: { thinking?: unknown; effort?: unknown }): void`
- `export function take(token: string): { thinking?: unknown; effort?: unknown } | null`

Implementation notes:

- Use a module-level `Map`.
- `take()` must delete the entry.
- Prefer `structuredClone()` on input to avoid accidental mutation across phases.

Verification for T04:

- Typecheck (`bun run typecheck`) should still pass after adding the module.

### [T05] Refactor `src/plugin.ts` to detect/stash/swap and simplify effort remap

File: `src/plugin.ts`

Replace the current “effort inference” logic with:

1. Guards (unchanged intent):
   - provider is `copilot-messages`
   - model option `adaptiveThinking === true`
2. Built-in effort remap only:
   - explicit `output.options.effort` is respected when it is one of `low|medium|high` (not `max`)
   - variant remap is only for `"high"` and `"max"`
   - precedence: explicit effort beats variant
3. Forward-compat detect/stash/swap:
   - detect:
     - `output.options.thinking` is an object with `type === "adaptive"`, and/or
     - `output.options.effort === "max"`
   - stash:
     - generate `token = crypto.randomUUID()`
     - `put(token, { thinking: <literal>, effort: <literal> })` (include only the detected forward-compat pieces)
   - swap:
     - set `output.options.thinking = { type: "enabled", budgetTokens: 1024 }`
     - if effort is exactly `"max"`, `delete output.options.effort`
4. Pending bridge to headers:
   - extend `pending` value to include both `effort` and `stash`
   - `chat.headers` emits:
     - `x-adaptive-effort` (if present)
     - `x-adaptive-stash` (if present)
   - delete the pending entry after emitting

Verification for T05:

- Run `bun test src/plugin.test.ts`.

### [T06] Refactor `src/provider/fetch.ts` to swap stashed config into request body

File: `src/provider/fetch.ts`

Changes:

1. Read and delete headers:
   - `x-adaptive-effort` (existing)
   - `x-adaptive-stash` (new)
2. If stash header is present:
   - `const saved = take(token)`
   - if `saved` exists and `body.raw` exists, stringify a swapped JSON body:
     - if `saved.thinking` exists: replace `raw.thinking`
     - if `saved.effort` exists: replace `raw.output_config` with `{ effort: saved.effort }`
3. If no stash, preserve existing effort-header behavior, but switch to swap semantics:
   - when `x-adaptive-effort` is set and `body.thinking?.type === "enabled"` and `body.raw` exists:
     - replace `raw.thinking = { type: "adaptive" }`
     - replace `raw.output_config = { effort }`

Verification for T06:

- Run `bun test src/provider/fetch.test.ts`.
- Run `bun test` to ensure no cross-file regressions.

### [T07] Cleanup

- Ensure no new `let`/`else` patterns are introduced.
- Keep helper names single-word where possible.
- Remove any now-obsolete tests that assert merge behavior.

Verification for T07:

- `bun test`
- `bun run typecheck`
- `bun run lint`
