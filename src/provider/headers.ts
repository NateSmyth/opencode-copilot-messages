/**
 * Header construction for Copilot Messages API.
 *
 * Required headers:
 * - Authorization: Bearer ${sessionToken}
 * - User-Agent: opencode/${version}
 * - Editor-Version: opencode/${version}
 * - Editor-Plugin-Version: copilot-messages/${pluginVersion}
 * - Copilot-Integration-Id: opencode
 * - X-Request-Id: ${uuid}
 * - X-Interaction-Type: messages-proxy
 * - OpenAI-Intent: messages-proxy
 * - X-GitHub-Api-Version: 2025-05-01
 * - X-Initiator: user | agent (CRITICAL for billing)
 * - anthropic-beta: interleaved-thinking-2025-05-14
 * - Copilot-Vision-Request: true (when images present)
 */

export interface HeaderContext {
	sessionToken: string
	version: string
	pluginVersion: string
	initiator: "user" | "agent"
	hasImages?: boolean
	betaFeatures?: string[]
}

export function buildHeaders(context: HeaderContext): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${context.sessionToken}`,
		"User-Agent": `opencode/${context.version}`,
		"Editor-Version": `opencode/${context.version}`,
		"Editor-Plugin-Version": `copilot-messages/${context.pluginVersion}`,
		"Copilot-Integration-Id": "opencode",
		"X-Request-Id": crypto.randomUUID(),
		"X-Interaction-Type": "messages-proxy",
		"OpenAI-Intent": "messages-proxy",
		"X-GitHub-Api-Version": "2025-05-01",
		"X-Initiator": context.initiator,
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
