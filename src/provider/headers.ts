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
 * - X-Interaction-Type: conversation-agent
 * - OpenAI-Intent: conversation-agent
 * - X-GitHub-Api-Version: 2025-05-01
 * - X-Initiator: user | agent (CRITICAL for billing)
 * - anthropic-beta: interleaved-thinking-2025-05-14
 */

export interface HeaderContext {
	sessionToken: string
	version: string
	pluginVersion: string
	initiator: "user" | "agent"
	betaFeatures?: string[]
}

export function buildHeaders(_context: HeaderContext): Record<string, string> {
	// TODO: Implement buildHeaders()
	return {}
}
