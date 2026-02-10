import { buildHeaders } from "./headers"
import { type AnthropicMessage, determineInitiator, hasImageContent } from "./initiator"
import { take } from "./stash"

export interface FetchContext {
	sessionToken: string
}

export async function copilotMessagesFetch(
	input: string | URL | Request,
	init: RequestInit | undefined,
	context: FetchContext
): Promise<Response> {
	const headers = merge(input, init)
	headers.delete("x-api-key")
	const body = await readBody(init?.body)
	const effort = parseEffort(headers.get("x-adaptive-effort"))
	headers.delete("x-adaptive-effort")
	const token = headers.get("x-adaptive-stash")
	headers.delete("x-adaptive-stash")
	const initiator =
		forcedInitiator(headers.get("x-initiator")) ??
		(isInternalAgent(body) ? "agent" : determineInitiator(body.messages))
	const images = hasImageContent(body.messages)
	const copilot = buildHeaders({
		sessionToken: context.sessionToken,
		initiator,
		hasImages: images,
	})

	for (const [key, value] of Object.entries(copilot)) {
		headers.set(key, value)
	}

	const rewritten = rewrite(body, token, effort)

	return fetch(input, {
		...init,
		body: rewritten ?? init?.body,
		headers,
	})
}

const decoder = new TextDecoder()

function merge(input: string | URL | Request, init: RequestInit | undefined): Headers {
	const headers = new Headers(input instanceof Request ? input.headers : undefined)
	if (!init?.headers) return headers
	const incoming = new Headers(init.headers)
	for (const [key, value] of incoming.entries()) {
		headers.set(key, value)
	}
	return headers
}

interface ParsedBody {
	messages: AnthropicMessage[]
	system?: string | Array<{ type: string; text?: string }>
	thinking?: { type: string; budget_tokens?: number }
	raw?: Record<string, unknown>
}

async function readBody(body: RequestInit["body"] | null | undefined): Promise<ParsedBody> {
	if (!body) return { messages: [] }
	if (typeof body === "string") return parse(body)
	if (body instanceof ArrayBuffer) return parse(decoder.decode(body))
	if (ArrayBuffer.isView(body)) return parse(decoder.decode(body))
	return { messages: [] }
}

function parse(text: string): ParsedBody {
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>
		const messages = Array.isArray(parsed.messages) ? (parsed.messages as AnthropicMessage[]) : []
		const system = parsed.system as ParsedBody["system"]
		const thinking = parsed.thinking as ParsedBody["thinking"]
		return { messages, system, thinking, raw: parsed }
	} catch {
		return { messages: [] }
	}
}

export type Effort = "low" | "medium" | "high" | "max"

export const EFFORTS = new Set<string>(["low", "medium", "high", "max"])

function parseEffort(value: string | null): Effort | null {
	if (EFFORTS.has(value ?? "")) return value as Effort
	return null
}

function rewrite(
	body: ParsedBody,
	token: string | null,
	effort: Effort | null
): string | undefined {
	if (!body.raw) return undefined

	// Stash path: restore user's literal config
	if (token) {
		const saved = take(token)
		if (!saved) return undefined
		if (saved.thinking) body.raw.thinking = saved.thinking
		if (saved.effort) body.raw.output_config = { effort: saved.effort }
		return JSON.stringify(body.raw)
	}

	// Effort-header path: full swap
	if (!effort || body.thinking?.type !== "enabled") return undefined
	body.raw.thinking = { type: "adaptive" }
	body.raw.output_config = { effort }
	return JSON.stringify(body.raw)
}

function isInternalAgent(body: ParsedBody): boolean {
	const system = body.system
	if (!system) return false
	if (typeof system === "string") {
		return system.startsWith("You are a title generator")
	}
	if (Array.isArray(system) && system.length > 0) {
		const first = system[0]
		if (typeof first === "object" && typeof first.text === "string") {
			return first.text.startsWith("You are a title generator")
		}
	}
	return false
}

function forcedInitiator(value: string | null): "user" | "agent" | null {
	if (value === "user" || value === "agent") return value
	return null
}
