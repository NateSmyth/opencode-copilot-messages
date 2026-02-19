export interface HeaderContext {
	token: string
	initiator: "user" | "agent"
	hasImages?: boolean
}

export function buildHeaders(context: HeaderContext): Record<string, string> {
	const headers: Record<string, string> = {
		authorization: `Bearer ${context.token}`,
		"copilot-integration-id": "copilot-developer-cli",
		"x-github-api-version": "2025-05-01",
		"x-interaction-type": "conversation-agent",
		"openai-intent": "conversation-agent",
		"x-interaction-id": crypto.randomUUID(),
		"x-request-id": crypto.randomUUID(),
		"x-initiator": context.initiator,
	}
	if (context.hasImages) {
		headers["Copilot-Vision-Request"] = "true"
	}
	return headers
}
