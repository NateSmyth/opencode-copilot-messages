# opencode-copilot-responses Pre-Publish Audit Summary

_2026-02-19_

## Reports

1. [Auth Module](auth-module.yaml)
2. [Provider Module](provider-module.yaml)
3. [Models & Plugin Integration](models-plugin.yaml)
4. [Test Quality](test-quality.yaml)
5. [Style & Spec Compliance](style-spec-compliance.yaml)
6. [Findings Triage](findings-triage.md)

## Executive Summary

Package is architecturally sound, well-tested (zero mocks, real HTTP servers throughout), and publish-ready after one bug fix. Initial audit surfaced ~15 findings; targeted investigation into the AI SDK source, real Copilot SSE captures, and GitHub OAuth behavior dismissed the majority as impossible given actual runtime behavior. One real bug remains.

## Must-Fix

- [ ] **`fetchModels()` no `res.ok` check** (`registry.ts:115`) — non-OK responses throw opaque `SyntaxError` instead of a clear error. Likely scenario: expired token, rate limit, outage.

## Should-Fix

- [ ] **Add failure-path test for `auth.loader`** when `/models` returns errors. Only real coverage gap.

## Nice-to-Have

- [ ] **Remove `stripIds`** — opencode's own fetch wrapper already strips input item IDs for `@ai-sdk/openai` models. Plugin's version is redundant.
- [ ] **Close pending live-validation items** (T05, T10, T12, T13)
- [ ] **Condense verbose comments** — normalize.ts header (10 lines) and fetch.ts:85-87 (3 lines) exceed style guide
- [ ] **Consolidate 6 trivial tests** into fewer behavioral tests
