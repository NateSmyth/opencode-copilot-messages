/**
 * Header construction for Copilot Messages API.
 *
 * We proxy as VSCode Copilot Chat, so headers must match exactly:
 *
 * - authorization: Bearer ${sessionToken}
 * - user-agent: GitHubCopilotChat/${pluginVersion}
 * - editor-version: vscode/${editorVersion}
 * - editor-plugin-version: copilot-chat/${pluginVersion}
 * - copilot-integration-id: vscode-chat
 * - x-request-id: ${uuid}
 * - x-interaction-type: conversation-agent
 * - openai-intent: conversation-agent
 * - x-github-api-version: 2025-10-01
 * - x-initiator: user | agent (CRITICAL for billing)
 * - anthropic-beta: interleaved-thinking-2025-05-14
 * - Copilot-Vision-Request: true (when images present)
 */

// VSCode version to proxy as
const VSCODE_VERSION = "1.108.2"
const COPILOT_CHAT_VERSION = "0.36.2"

export interface HeaderContext {
	sessionToken: string
	initiator: "user" | "agent"
	hasImages?: boolean
	betaFeatures?: string[]
	interaction?: string
	intent?: string
}

export function buildHeaders(context: HeaderContext): Record<string, string> {
	const headers: Record<string, string> = {
		authorization: `Bearer ${context.sessionToken}`,
		"user-agent": `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
		"editor-version": `vscode/${VSCODE_VERSION}`,
		"editor-plugin-version": `copilot-chat/${COPILOT_CHAT_VERSION}`,
		"copilot-integration-id": "vscode-chat",
		"x-request-id": crypto.randomUUID(),
		"x-interaction-type": context.interaction ?? "messages-proxy",
		"openai-intent": context.intent ?? "messages-proxy",
		"x-github-api-version": "2025-10-01",
		"x-initiator": context.initiator,
	}

	// Add anthropic-beta header with thinking support
	const betas = ["interleaved-thinking-2025-05-14", ...(context.betaFeatures ?? [])]
	headers["anthropic-beta"] = betas.join(",")

	// Add vision header if images present
	if (context.hasImages) {
		headers["Copilot-Vision-Request"] = "true"
	}

	return headers
}
