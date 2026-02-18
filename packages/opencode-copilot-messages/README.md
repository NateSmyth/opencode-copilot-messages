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

You will now see a new "copilot-messages" provider populated with all available models that support `/responses`, obtained from Copilot's `/models` endpoint.

## Config

The plugin will work without any additional config, but for the best experience it is recommended to override the default `limit.output` and `limit.context`:

```json
{
  "provider": {
    "copilot-messages": {
      "models": {
        "claude-opus-4.6": {
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

## Quota

Currently, the "Premium Request" cost per model is:

- Haiku: 0.33x
- Sonnet: 1x
- Opus 4.5: 3x
- Opus 4.6: 3x
- Opus 4.1: 10x

This plugin properly handles the "user-initiated" vs. "agent-initiated" headers so you only spend requests on actual prompts. Tool loops and subagents are agent-initiated.
