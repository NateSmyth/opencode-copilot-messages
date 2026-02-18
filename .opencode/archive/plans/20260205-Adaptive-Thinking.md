# Plan: Claude 4.6 Adaptive Thinking Support

## Summary

Add support for Claude Opus 4.6's adaptive thinking and effort parameter while staying on `@ai-sdk/anthropic@2.0.58`.

**Constraint**: The v2 SDK only accepts `thinking.type: "enabled" | "disabled"` and has no `effort` field. Upgrading to v3 requires AI SDK 6 (OpenCode is on SDK 5). Solution: use header-signaling + fetch body rewrite.

## Key Files to Modify

- `src/models/registry.ts` - Add adaptive_thinking detection
- `src/provider/headers.ts` - Add effort header generation
- `src/provider/fetch.ts` - Add body rewrite for adaptive models
- `src/plugin.ts` - Enhance `chat.headers` hook for effort signaling

## Implementation

### Phase 1: Model Registry Updates

**Goal**: Detect and expose adaptive thinking capability from Copilot `/models` response.

**Files**: `src/models/registry.ts`

1. Update `CopilotModel.capabilities.supports` interface:

   ```ts
   supports?: {
     // existing...
     adaptive_thinking?: boolean     // NEW
     structured_outputs?: boolean    // NEW (future-proofing)
   }
   ```

2. Update `mapToOpencodeModel()`:
   - Set `options.adaptiveThinking = supports.adaptive_thinking ?? false`
   - Update output limit: `limits.max_output_tokens` is now 64000 for 4.6 (128K via streaming)

3. Update test fixture in `registry.test.ts` to include new capability fields.

**Tests (RED)**:

- Test that a model with `adaptive_thinking: true` maps to `options.adaptiveThinking: true`
- Test that max_output_tokens 64000 is preserved correctly

### Phase 2: Effort Header Generation

**Goal**: Signal adaptive intent via a custom header that the fetch interceptor can read.

**Files**: `src/provider/headers.ts`, `src/plugin.ts`

1. Add new header field to `HeaderContext`:

   ```ts
   adaptiveEffort?: "high" | "max"  // NEW
   ```

2. Update `buildHeaders()` to emit `x-adaptive-effort` header when set.

3. Enhance `chat.headers` hook in `plugin.ts`:

   ```ts
   "chat.headers": async (data, output) => {
     if (data.model.providerID !== "copilot-messages") return
     // existing subagent check...

     // NEW: Adaptive effort signaling
     // Only signal if:
     // 1. Model supports adaptive thinking
     // 2. User has selected a variant (high/max) - otherwise no thinking is enabled
     const adaptive = data.model.options?.adaptiveThinking === true
     const variant = data.message.variant as "high" | "max" | undefined
     if (adaptive && variant) {
       output.headers["x-adaptive-effort"] = variant
     }
   }
   ```

**Behavior**:

- No variant selected → no header → no rewrite → thinking NOT enabled (same as current)
- Variant "high" → header "high" → rewrite to adaptive + effort high
- Variant "max" → header "max" → rewrite to adaptive + effort max

**Tests (RED)**:

- Test `buildHeaders()` emits `x-adaptive-effort` when `adaptiveEffort` is set
- Test plugin hook sets header for adaptive models with variant

### Phase 3: Fetch Body Rewrite

**Goal**: Transform SDK-generated body to use Anthropic's adaptive thinking format.

**Files**: `src/provider/fetch.ts`

1. Add `transformForAdaptive()` function:

   ```ts
   function transformForAdaptive(
     body: ParsedBody & {
       thinking?: object;
       max_tokens?: number;
       model?: string;
     },
     effort: "high" | "max",
   ): string {
     // Transform SDK's enabled format to Anthropic adaptive format:
     // - Remove thinking.budget_tokens
     // - Set thinking.type = "adaptive"
     // - Add output_config.effort
     // - Keep max_tokens as-is (model allocates within total limit)
   }
   ```

2. Update `copilotMessagesFetch()`:

   ```ts
   const adaptiveEffort = headers.get("x-adaptive-effort") as
     | "high"
     | "max"
     | null;
   if (adaptiveEffort && body.thinking?.type === "enabled") {
     const newBody = transformForAdaptive(body, adaptiveEffort);
     return fetch(input, { ...init, body: newBody, headers });
   }
   ```

3. Remove the `x-adaptive-effort` header before sending (internal signal only).

**Body transformation logic**:

```ts
// Input (from SDK):
{
  thinking: { type: "enabled", budget_tokens: 16000 },
  max_tokens: 32000,  // SDK calculated: original + budget
  ...
}

// Output (to Anthropic):
{
  thinking: { type: "adaptive" },
  output_config: { effort: "high" },
  max_tokens: 32000,  // KEEP AS-IS (4.6 supports 128K output, model allocates within limit)
  ...
}
```

**Tests (RED)**:

- Test body rewrite transforms thinking.type from "enabled" to "adaptive"
- Test body rewrite adds `output_config.effort` matching header value
- Test body rewrite keeps max_tokens unchanged
- Test no rewrite when header absent
- Test no rewrite when thinking.type !== "enabled"
- Test effort "max" produces `output_config.effort: "max"`

### Phase 4: Integration Verification

**Goal**: End-to-end validation that the full flow works.

1. Update plugin integration test to:
   - Mock a model with `adaptiveThinking: true`
   - Set variant on the message
   - Verify outgoing request has adaptive thinking format

2. Manual testing with real Copilot API (if available):
   - Send request with Opus 4.6 model
   - Verify thinking blocks work correctly

## Verification Criteria

1. **Unit tests pass**: `bun test` all green
2. **Type check**: `bun run check` passes
3. **Lint**: `bun run lint` passes
4. **Manual verification**: (if Opus 4.6 available on Copilot)
   - Request shows `thinking: {type: "adaptive"}` and `output_config: {effort}` in body
   - Response includes thinking blocks

## Files Changed

| File                          | Changes                                                                 |
| ----------------------------- | ----------------------------------------------------------------------- |
| `src/models/registry.ts`      | Add `adaptive_thinking` to interface, map to `options.adaptiveThinking` |
| `src/models/registry.test.ts` | Add test for adaptive capability mapping                                |
| `src/provider/headers.ts`     | Add `adaptiveEffort` to context, emit `x-adaptive-effort` header        |
| `src/provider/fetch.ts`       | Add `transformForAdaptive()`, modify `copilotMessagesFetch()`           |
| `src/provider/fetch.test.ts`  | Add body rewrite tests                                                  |
| `src/plugin.ts`               | Enhance `chat.headers` hook for effort signaling                        |
| `src/plugin.test.ts`          | Add integration test for adaptive flow                                  |

## Risks & Mitigations

1. **SDK strips unknown options**: Mitigated by signaling via headers, not provider options
2. **Copilot proxy doesn't support adaptive**: Falls back gracefully - if no rewrite occurs, deprecated `type: "enabled"` format still works
3. **max_tokens handling**: Keep as-is. SDK calculates `original + budget`, Opus 4.6 supports 128K output, model allocates tokens within limit

## Design Decisions

1. **Direct effort mapping**: variant "high" → effort "high", variant "max" → effort "max"
2. **No variant = no thinking**: Follows existing behavior - thinking only enabled when variant selected
3. **Keep beta header unconditional**: `interleaved-thinking-2025-05-14` is safely ignored on 4.6, still needed for older models

## Out of Scope

- Upgrading to @ai-sdk/anthropic v3.x (requires OpenCode SDK 6 upgrade)
- `output_format` → `output_config.format` migration (structured outputs)
- Compaction API support
- Removing deprecated beta headers (kept unconditional per user decision)
