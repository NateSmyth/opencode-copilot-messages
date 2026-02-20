# Findings Triage — Post-Investigation Update

_2026-02-19_

## Methodology

Following the initial audit, targeted investigations were dispatched to determine whether speculative findings represent real scenarios or impossible/theoretical edge cases. Three investigation agents examined:

1. How `@ai-sdk/openai` actually calls custom `fetch` (SDK source code analysis)
2. What SSE event types the Copilot proxy actually emits (real SSE captures analysis)
3. How GitHub OAuth endpoints actually behave on errors (GitHub docs + community evidence)

Additionally, discovery of opencode's own fetch wrapper revealed a key fact: **opencode already strips `id` fields from input items** before calling the plugin's custom fetch.

---

## Triage Results

### DISMISSED — Cannot happen in practice

| #   | Original Finding                                                            | Verdict                                                                                                                                                      | Evidence                                  |
| --- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| B   | `stripIds` only handles string bodies — ArrayBuffer/Uint8Array pass through | **Cannot happen.** `@ai-sdk/openai` always passes `JSON.stringify()` strings. Confirmed in `provider-utils/dist/index.mjs` line 729.                         | SDK source                                |
| C   | Body analysis skips Request objects                                         | **Cannot happen.** `@ai-sdk/openai` always calls `fetch(url, init)`, never `fetch(new Request(...))`. Confirmed in `provider-utils/dist/index.mjs` line 767. | SDK source                                |
| E   | SSE CRLF separators could break normalizer                                  | **Cannot happen.** Copilot proxy uses standard LF (`\n`). Confirmed in real SSE captures.                                                                    | Captured streams                          |
| F   | Canonical ID map grows unboundedly                                          | **Not a real concern.** Typical responses have 2-3 output items. Map is scoped to a single stream and GC'd when stream ends.                                 | Captured streams (2-5 items max observed) |
| H   | Double JSON.parse performance concern                                       | **Not meaningful.** Single JSON parse of a request body is sub-millisecond. Network latency to Copilot API dominates by orders of magnitude.                 | Common sense                              |

### DISMISSED — Redundant with opencode

| #   | Original Finding                            | Verdict                                                                                                                                                                                                                                                          | Evidence                              |
| --- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| B+  | `stripIds` incomplete for non-string bodies | **Moot.** Opencode's own fetch wrapper at `provider.ts:1032-1043` already strips `id` from all input items for `@ai-sdk/openai` models _before_ calling the plugin's custom fetch. The plugin's `stripIds` is a redundant safety net (harmless but unnecessary). | opencode `provider.ts` line 1032-1043 |

### CONFIRMED REAL — But low severity / edge case only

| #   | Original Finding                                  | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                        |
| --- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| A   | `determineInitiator` misses string content        | **Partially real but mischaracterized.** `@ai-sdk/openai` produces string content for system/developer messages, NOT user messages. Since `determineInitiator` looks at the _last_ input item and only returns "user" when `role: "user"` with structured text content, and the SDK always uses structured arrays for user messages, the "user" → "user" path works correctly. A system message as the last item would correctly map to "agent". **No functional bug.** | SDK source: `convertToOpenAIResponsesInput()`   |
| D   | `ITEM_ID_EVENTS` missing refusal/annotation/audio | **Theoretical only.** Real Copilot SSE captures show exactly the events covered by `ITEM_ID_EVENTS`. Refusal, annotation, and audio events have **never been observed** from the Copilot proxy. If Copilot starts emitting refusals in the future, the normalizer would need updating, but this is not a current bug.                                                                                                                                                   | Exhaustive SSE capture analysis                 |
| G   | `pollForToken` no `res.ok` check                  | **Real edge case, low severity.** GitHub returns all OAuth errors as JSON with HTTP 200 (not 4xx). The `res.json()` call works correctly for all standard error cases. The only failure scenario is a GitHub infrastructure outage returning an HTML 502 page — `res.json()` would throw `SyntaxError` instead of a clear HTTP status error. The sibling `opencode-copilot-messages` package has the **identical omission**.                                            | GitHub docs, Octokit source, community evidence |

### CONFIRMED REAL — Unchanged severity

| #   | Original Finding                           | Severity   | Notes                                                                                                                                                                                                       |
| --- | ------------------------------------------ | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| -   | `fetchModels()` no `res.ok` check          | **Medium** | Same class of bug as G — infrastructure outages produce confusing SyntaxError. Unlike OAuth where errors are JSON/200, the `/models` endpoint may return real 4xx errors that should be handled gracefully. |
| -   | Header minimization not applied (spec T10) | **Low**    | Documented as pending in spec. Extra headers are harmless — they're just unnecessary.                                                                                                                       |
| -   | `limit.output` default 64000 vs spec 16000 | **Low**    | Spec-code mismatch. Needs a decision on which is correct.                                                                                                                                                   |

---

## Impact on Original Must-Fix / Should-Fix Lists

### Revised Must-Fix (before publish)

1. ~~`reasoning: true` unconditional~~ — **Resolved** (spec was wrong)
2. ~~Missing `@ai-sdk/openai` dependency~~ — **Dismissed** (opencode bundles it)
3. **`fetchModels()` no `res.ok` check** — Still valid. Medium severity.

### Revised Should-Fix

4. ~~SSE normalizer missing event types~~ — **Downgraded to nice-to-have**. Not observed in practice.
5. ~~`stripIds` skips non-string bodies~~ — **Dismissed**. Cannot happen + opencode strips first anyway.
6. **`limit.output` default mismatch** — Still valid. Needs spec/code alignment decision.

### Findings that were entirely speculative (dismissed)

- ArrayBuffer/Uint8Array body handling (B)
- Request object handling (C)
- CRLF SSE parsing (E)
- Unbounded map growth (F)
- Double JSON.parse performance (H)
- String content misclassification (A — partially, but no functional impact)

---

## Bonus Discovery: Redundant ID Stripping

The plugin's `stripIds` function in `fetch.ts` strips `id` fields from input items. However, opencode's own fetch wrapper at `provider.ts:1032-1043` does the **exact same thing** for all `@ai-sdk/openai` models before the plugin's fetch is ever called. The plugin's `stripIds` is therefore a redundant safety net.

This is not a bug — defense in depth is fine — but it does mean:

1. The double JSON.parse in `fetch.ts` (once in `readBody` + once in `stripIds`) could be eliminated entirely by removing `stripIds`, since opencode handles it.
2. Alternatively, if keeping the safety net, the `readBody` parse result could be reused.
