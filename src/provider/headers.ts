import { COPILOT_CHAT_VERSION, VSCODE_VERSION } from "../auth/headers"

export interface HeaderContext {
	sessionToken: string
	initiator: "user" | "agent"
	hasImages?: boolean
	interaction?: string
	intent?: string
	adaptiveEffort?: "high" | "max"
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
		"anthropic-beta": "interleaved-thinking-2025-05-14",
	}

	if (context.hasImages) {
		headers["Copilot-Vision-Request"] = "true"
	}

	return headers
}
