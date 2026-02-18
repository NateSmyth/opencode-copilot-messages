# Copilot Messages API Provider for Opencode

This plugin provides access to the `api.githubcopilot.com/v1/messages` for accessing Claude 4.x models via your Copilot subscription.

The built-in Copilot client in Opencode has first-class support for OpenAI's `/responses` endpoint, used by GPT-5.x models, but Anthropic (and Google) models fall back to the more limited `/chat/completions` endpoint.

If you use them side-by-side (which you can with this plugin), the performance degradation will be immediately noticeable. Copilot's `/messages` endpoint proxies the same endpoint used by the first-party Anthropic provider.

## Setup

1. Add to the `plugin` array in `opencode.json` or `opencode.jsonc`:

```json
  "plugin": [
    "opencode-copilot-messages@latest"
  ]
```

2. Run `opencode auth login`
3. Search or scroll to "other"
4. Enter "copilot-messages"
5. Finish OAuth flow in browser
6. Launch opencode

You will now see a new "copilot-messages" provider populated with all available models that support `/v1/messages`, obtained from Copilot's `/models` endpoint. Any new Claude model's will be automatically added without the need to update the plugin.

## Config

The plugin will work without any additional config, but for the best experience it is recommended to override the default `limit.output` and `limit.context`.

<details>

<summary>Example config</summary>

```json
{
  "provider": {
    "copilot-messages": {
      "models": {
        "claude-opus-4.5": {
          "limit": {
            "context": 200000,
            "output": 64000
          }
        }
      }
    }
  }
}
```

</details>

### Adaptive Thinking

This plugin supports "Adaptive Thinking" configuration for Claude 4.6 models. By default, it automatically translates Opencode's built-in "High" and "Max" variants to adaptive thinking with "High" and "Max" effort levels, respectively.

For custom variants, simply configure `thinking.type` as `adaptive` and `effort` as `low|medium|high|max` in your config.

<details>

<summary>Example config</summary>

```json
"provider": {
  "copilot-messages": {
    "models": {
      "claude-opus-4.6": {
        "limit": {
          "context": 200000,
          "output": 64000
        },
        "variants": {
          "custom": {
            "thinking": {
              "type": "adaptive"
            },
            "effort": "medium"
          }
        }
      }
    }
  }
}
```
</details>

Availability is based on `/models`'s `supports.adaptive_thinking` reported capabilities, which is restricted to Sonnet 4.6 and Opus 4.6.

<details>

<summary>Note</summary>

*Since Opencode is pinned to an old version of the `ai-sdk`, some hackiness is involved to circumvent the SDK's schema validation on `thinking.type` and `effort`. It works fine, but report any issues you encounter.*

</details>

## Quota

Currently, the "Premium Request" cost per model is:

- Haiku 4.5: 0.33x
- Sonnet 4.5: 1x
- Sonnet 4.6: 1x
- Opus 4.5: 3x
- Opus 4.6: 3x
- Opus 4.6 (Fast Mode): 30x (!)

<details>

<summary>Notes</summary>

*Opus 4.1 was removed from Copilot in February 2026.*
*Opus 4.6 (Fast Mode) cost 9x during its initial promotional period, but 30x is accurate as of February 18th, 2026.*

This plugin properly handles the "user-initiated" vs. "agent-initiated" headers so you only spend requests on actual prompts. Tool loops, subagents, and title generation are agent-initiated.

</details>
