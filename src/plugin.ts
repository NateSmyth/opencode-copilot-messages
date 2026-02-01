import type { Hooks, Plugin } from "@opencode-ai/plugin"

/**
 * OpenCode plugin for Copilot Claude via Anthropic Messages API.
 *
 * This plugin provides an alternate auth/routing path for Claude models
 * via Copilot's /v1/messages proxy endpoint (api.copilot.com/v1/messages).
 *
 * Key differences from standard Copilot:
 * - Uses client ID: Iv1.b507a08c87ecfe98
 * - Requires token exchange via /copilot_internal/v2/token
 * - Uses @ai-sdk/anthropic (Anthropic Messages API format)
 * - Critical: X-Initiator must check for tool_result content blocks
 */
export const CopilotMessagesPlugin: Plugin = async (_input) => {
	// TODO: Implement plugin
	const hooks: Hooks = {
		auth: {
			provider: "copilot-messages",
			methods: [],
			// loader: async (getAuth, provider) => { ... }
		},
	}

	return hooks
}
