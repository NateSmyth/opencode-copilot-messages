export function determineInitiator(input: unknown): "user" | "agent" {
	if (!Array.isArray(input) || input.length === 0) return "agent"
	const last = input[input.length - 1] as Record<string, unknown>
	if (!last) return "agent"
	if (last.type === "function_call_output") return "agent"
	if (last.role !== "user") return "agent"
	const content = last.content
	if (!Array.isArray(content) || content.length === 0) return "agent"
	for (const part of content) {
		if (typeof part === "object" && part !== null && (part as Record<string, unknown>).type === "input_text") return "user"
	}
	return "agent"
}

export function hasImageContent(input: unknown): boolean {
	if (!Array.isArray(input)) return false
	for (const item of input) {
		if (typeof item !== "object" || item === null) continue
		const content = (item as Record<string, unknown>).content
		if (!Array.isArray(content)) continue
		for (const part of content) {
			if (typeof part === "object" && part !== null && (part as Record<string, unknown>).type === "input_image") return true
		}
	}
	return false
}
