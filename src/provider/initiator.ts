/**
 * X-Initiator determination for Copilot billing.
 *
 * CRITICAL: X-Initiator affects billing.
 * - "user" = premium request (uses quota)
 * - "agent" = not charged (tool calls, subagent sessions)
 *
 * For Anthropic Messages API, tool_result blocks are in role: user messages,
 * so we MUST check content block type, not just role!
 *
 * Algorithm:
 * 1. If last message role !== "user" -> "agent"
 * 2. If last message role === "user" AND contains tool_result block -> "agent"
 * 3. If subagent session context -> "agent"
 * 4. Otherwise -> "user"
 */

export interface AnthropicContentBlock {
	type: string
	[key: string]: unknown
}

export interface AnthropicMessage {
	role: "user" | "assistant"
	content: string | AnthropicContentBlock[]
}

/**
 * Determine X-Initiator value based on message content.
 *
 * @param messages - The messages being sent to the API
 * @param isSubagent - Whether this is a subagent session
 * @returns "user" or "agent"
 */
export function determineInitiator(
	messages: AnthropicMessage[],
	isSubagent: boolean = false
): "user" | "agent" {
	// Subagent sessions are always agent-initiated
	if (isSubagent) return "agent"

	const lastMsg = messages.at(-1)
	if (!lastMsg) return "agent"

	// Non-user role is always agent-initiated
	if (lastMsg.role !== "user") return "agent"

	// User role - check for tool_result content blocks
	if (Array.isArray(lastMsg.content)) {
		const hasToolResult = lastMsg.content.some(
			(block) => typeof block === "object" && block.type === "tool_result"
		)
		if (hasToolResult) return "agent"
	}

	// Actual user message
	return "user"
}
