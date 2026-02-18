# Copilot Responses API Provider for OpenCode

This plugin provides access to `api.githubcopilot.com/responses` for accessing OpenAI models (GPT-5.x) via your Copilot subscription.

## Setup

1. Add to the `plugin` array in `opencode.json` or `opencode.jsonc`:

```json
  "plugin": [
    "opencode-copilot-responses@latest"
  ]
```

2. Run `opencode auth login`
3. Search or scroll to "other"
4. Enter "copilot-responses"
5. Finish OAuth flow in browser
6. Launch opencode

You will now see a new "copilot-responses" provider populated with all available models that support `/responses`, obtained from Copilot's `/models` endpoint.
