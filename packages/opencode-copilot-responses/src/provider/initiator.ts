export function determineInitiator(input: unknown): "user" | "agent" {
	if (!Array.isArray(input) || input.length === 0) return "agent"
	const last = input[input.length - 1]
	if (typed(last, "function_call_output")) return "agent"
	if (!has(last, "role", "user")) return "agent"
	const content = (last as Record<string, unknown>).content
	if (!Array.isArray(content) || content.length === 0) return "agent"
	if (content.some((p: unknown) => typed(p, "input_text"))) return "user"
	return "agent"
}

export function hasImageContent(input: unknown): boolean {
	if (!Array.isArray(input)) return false
	for (const item of input) {
		const content =
			item !== null && typeof item === "object"
				? (item as Record<string, unknown>).content
				: undefined
		if (!Array.isArray(content)) continue
		if (content.some((p: unknown) => typed(p, "input_image"))) return true
	}
	return false
}

function typed(value: unknown, kind: string): boolean {
	return (
		value !== null && typeof value === "object" && (value as Record<string, unknown>).type === kind
	)
}

function has(value: unknown, key: string, expected: string): boolean {
	return (
		value !== null &&
		typeof value === "object" &&
		(value as Record<string, unknown>)[key] === expected
	)
}
