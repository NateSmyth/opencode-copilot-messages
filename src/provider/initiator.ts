export interface AnthropicContentBlock {
	type: string
	[key: string]: unknown
}

export interface AnthropicMessage {
	role: "user" | "assistant"
	content: string | AnthropicContentBlock[]
}

export function determineInitiator(messages: AnthropicMessage[]): "user" | "agent" {
	const lastMsg = messages.at(-1)
	if (!lastMsg) return "agent"

	if (lastMsg.role !== "user") return "agent"
	if (typeof lastMsg.content === "string") return "user"

	if (Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
		const lastBlock = lastMsg.content.at(-1)
		if (typeof lastBlock === "object" && lastBlock.type === "text") {
			return "user"
		}
	}

	return "agent"
}

export function hasImageContent(messages: AnthropicMessage[]): boolean {
	for (const msg of messages) {
		if (typeof msg.content === "string") continue
		if (!Array.isArray(msg.content)) continue

		for (const block of msg.content) {
			if (typeof block !== "object") continue
			if (block.type === "image") return true
			if (block.type === "tool_result" && Array.isArray(block.content)) {
				for (const inner of block.content as AnthropicContentBlock[]) {
					if (typeof inner === "object" && inner.type === "image") return true
				}
			}
		}
	}
	return false
}
