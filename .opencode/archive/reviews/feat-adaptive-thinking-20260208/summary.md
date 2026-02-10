# Feature Branch Review: feat/adaptive-thinking-4.6

_2026-02-08_

## TOC

1. [Model Registry](model-registry.yaml)
2. [Plugin Hooks](plugin-hooks.yaml)
3. [Fetch & Body Rewrite](fetch-rewrite.yaml)
4. [Test Quality](test-quality.yaml)
5. [Config & Style](config-style.yaml)

## Executive Summary

This branch adds support for Opus 4.6's adaptive thinking feature across three layers: model capability detection (registry), effort resolution and signaling (plugin hooks), and request body rewriting (fetch layer). The implementation is clean, follows TDD discipline, and all 41 tests pass. The architecture uses an internal header (`x-adaptive-effort`) as a bridge between the plugin hook layer and the fetch layer — a pragmatic workaround for the lack of a direct channel between these stages in the OpenCode plugin API. The most notable concern is a potential race condition in the session-keyed effort map, though practical risk is low given typical session serialization.

### Critical Items

No critical or breaking issues were identified. All findings are medium or below.

- [ ] [Plugin Hooks] Session-keyed pending map can misapply effort under concurrent same-session requests
- [ ] [Test Quality] ReadableStream body path silently degrades (header stripped, body not rewritten)
- [ ] [Test Quality] Pending effort map edge cases (orphaned entries, overwrites) lack test coverage
- [ ] [Model Registry] `structured_outputs` field added to interface but never mapped or tested

**Attestation**: I personally verified all medium-severity findings by reading the relevant source code and confirming the described behavior. Severity assessments are accurate. The test-quality-005 finding (global fetch patching) was reviewed and downgraded from medium to low — Bun runs tests within a file sequentially, limiting the blast radius.

## Findings by Domain

### Model Registry

#### Bugs

No bugs identified.

#### Style

Code follows project style guide. The `!!supports.adaptive_thinking` idiom is idiomatic and handles undefined/null/false correctly.

#### Performance

No performance concerns.

#### Optimization Opportunities

- **structured_outputs** (`info`): The `structured_outputs` field was added to the `CopilotModel.supports` interface but is not mapped to any Model-level field, nor tested. This appears to be forward-looking interface alignment with the upstream API, but it's currently inert. Consider removing until needed, or mapping it now if downstream consumers will use it.

### Plugin Hooks

#### Bugs

- **Concurrent session effort misapplication** (`medium`): The `pending` Map is keyed only by `sessionID`. If two requests for the same session overlap (e.g., parallel tool calls), the later `chat.params` overwrites the earlier entry. When `chat.headers` runs for the first request, it may consume the wrong effort. _Practical risk is low_ — OpenCode likely serializes requests per session — but the architecture is fragile. A request-scoped correlation key would be safer.

#### Style

No style violations in new code.

#### Performance

- **Orphaned pending entries** (`low`): If `chat.params` runs but `chat.headers` never executes (e.g., request abort), entries persist in the Map indefinitely. A later request on the same session could consume a stale effort. Consider a TTL or cleanup strategy.

#### Optimization Opportunities

- The `pending` Map pattern could be replaced if the plugin API ever exposes a request-scoped context object. Worth tracking as a future improvement.

### Fetch & Body Rewrite

#### Bugs

No bugs identified.

#### Style

- **EFFORTS typing** (`low`): `EFFORTS` is typed as `Set<string>` but the `Effort` type is `"low" | "medium" | "high" | "max"`. This forces `as Effort` casts in `parseEffort`. Typing the set as `Set<Effort>` would eliminate the casts.

#### Performance

No performance concerns.

#### Optimization Opportunities

- **ParsedBody thinking cache divergence** (`info`): `rewriteBody()` mutates `parsed.thinking` on the raw object, but `body.thinking` still holds the pre-mutation reference. Currently safe because nothing reads `body.thinking` after rewrite, but a future reader would see stale data. Consider deriving thinking from `raw` when needed instead of caching separately.

### Test Quality

#### Bugs

No test bugs — all 41 tests correctly verify the described behavior.

#### Style

- **Boilerplate repetition** (`low`): Multiple tests re-create near-identical `Bun.serve()` scaffolding. A small helper could reduce noise while preserving assertion locality.

#### Performance

No performance concerns in test execution.

#### Optimization Opportunities

- **ReadableStream body coverage gap** (`medium`): `readBody()` returns an empty `ParsedBody` for ReadableStream bodies, causing silent degradation when `x-adaptive-effort` is set — the header is stripped but the body is not rewritten. Needs a test to assert intended behavior.
- **Pending map edge case coverage** (`medium`): No tests for orphaned entries (chat.params without chat.headers) or duplicate same-session params calls.
- **Invalid effort header values** (`low`): No test for malformed values like `"HIGH"`, `"hi"`, or whitespace.
- **Non-"enabled" thinking types** (`low`): Only `"enabled"` and absent thinking are tested. A test with `thinking.type: "disabled"` would harden the guard condition.

### Config & Style

#### Bugs

No bugs.

#### Style

- **`let` in auth loader** (`low`): `let session` is reassigned during token refresh. The style guide prefers `const`. Could use a state holder object pattern.
- **JSDoc removal** (`info`): The module-level JSDoc explaining Copilot Messages routing (client ID, token exchange, X-Initiator rules) was removed. Key operational constraints should be preserved in README or a brief header comment.

#### Performance

No concerns.

#### Optimization Opportunities

The `opencode.jsonc` change is purely cosmetic (spaces → tabs, trailing newline added). No semantic impact.

## Recommended Priorities

1. **Plugin Hooks**: Add a comment documenting the assumption that sessions are serialized, or use a request-scoped key if one becomes available — prevents the concurrent misapplication scenario from becoming a real bug as usage patterns evolve.
2. **Test Quality**: Add a test for ReadableStream body + `x-adaptive-effort` to decide whether silent degradation is intended behavior (and document it) or should throw/warn.
3. **Test Quality**: Add edge-case tests for the pending map (orphaned entries, same-session overwrites) to lock in the intended behavior.
4. **Fetch Rewrite**: Type `EFFORTS` as `Set<Effort>` to eliminate unnecessary casts — low effort, improves type safety.
5. **Model Registry**: Decide on `structured_outputs` — either map it now or remove it to avoid interface drift.
6. **Config & Style**: Preserve key operational constraints from the removed JSDoc somewhere discoverable (README or brief module comment).
