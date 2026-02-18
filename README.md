# OpenCode Copilot Plugins

Monorepo for Copilot-related Opencode plugins.

## Packages

### `opencode-copilot-messages`: Copilot Messages API provider plugin for OpenCode

#### Quickstart

Add to the `plugin` array in `opencode.json` or `opencode.jsonc`:

```json
  "plugin": [
    "opencode-copilot-messages@latest"
  ]
```

1. Run `opencode auth login`
2. Search or scroll to "other"
3. Enter "copilot-messages"
4. Finish OAuth flow in browser
5. Launch opencode

For optional configuration and additional details, see the [README](packages/opencode-copilot-messages/README.md).

### `opencode-copilot-responses`: Copilot Responses API provider plugin for OpenCode

#### Quickstart

Add to the `plugin` array in `opencode.json` or `opencode.jsonc`:

```json
  "plugin": [
    "opencode-copilot-responses@latest"
  ]
```

1. Run `opencode auth login`
2. Search or scroll to "other"
3. Enter "copilot-responses"
4. Finish OAuth flow in browser
5. Launch opencode

For optional configuration and additional details, see the [README](packages/opencode-copilot-responses/README.md).
