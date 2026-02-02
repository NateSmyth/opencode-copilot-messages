/**
 * X-Initiator determination for Copilot billing.
 *
 * CRITICAL: X-Initiator affects billing.
 * - "user" = premium request (uses quota)
 * - "agent" = not charged (tool calls, subagent sessions)
 *
 * For Anthropic Messages API, tool_result blocks are in role: user messages.
 * We check ONLY THE LAST content block to determine initiator.
 *
 * Algorithm:
 * 1. If last message role !== "user" -> "agent"
 * 2. If last message role === "user" AND last content block is tool_result -> "agent"
 * 3. Otherwise -> "user"
 *
 * Note: Subagent detection is handled separately via chat.headers hook,
 * not in this function.
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
 * Checks ONLY the last content block of the last message.
 * If the last block is a tool_result, this is agent-initiated.
 *
 * @param messages - The messages being sent to the API
 * @returns "user" or "agent"
 */
export function determineInitiator(messages: AnthropicMessage[]): "user" | "agent" {
	const lastMsg = messages.at(-1)
	if (!lastMsg) return "agent"

	// Non-user role is always agent-initiated
	if (lastMsg.role !== "user") return "agent"

	// String content is always user-initiated
	if (typeof lastMsg.content === "string") return "user"

	// Check ONLY the last content block
	if (Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
		const lastBlock = lastMsg.content.at(-1)
		if (typeof lastBlock === "object" && lastBlock.type === "tool_result") {
			return "agent"
		}
	}

	// Actual user message
	return "user"
}

/**
 * Check if any content block in a message contains an image.
 * Used to determine if Copilot-Vision-Request header is needed.
 */
export function hasImageContent(messages: AnthropicMessage[]): boolean {
	for (const msg of messages) {
		if (typeof msg.content === "string") continue
		if (!Array.isArray(msg.content)) continue

		for (const block of msg.content) {
			if (typeof block !== "object") continue
			// Check for image block types
			if (block.type === "image") return true
			// Also check inside tool_result content
			if (block.type === "tool_result" && Array.isArray(block.content)) {
				for (const inner of block.content as AnthropicContentBlock[]) {
					if (typeof inner === "object" && inner.type === "image") return true
				}
			}
		}
	}
	return false
}
