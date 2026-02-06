import { buildHeaders } from "./headers"
import { type AnthropicMessage, determineInitiator, hasImageContent } from "./initiator"

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

	const rewritten =
		effort && body.thinking?.type === "enabled" ? rewriteBody(init?.body, effort) : undefined

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
		const parsed = JSON.parse(text) as {
			messages?: unknown
			system?: unknown
			thinking?: unknown
		}
		const messages = Array.isArray(parsed.messages) ? (parsed.messages as AnthropicMessage[]) : []
		const system = parsed.system as ParsedBody["system"]
		const thinking = parsed.thinking as ParsedBody["thinking"]
		return { messages, system, thinking }
	} catch {
		return { messages: [] }
	}
}

function parseEffort(value: string | null): "high" | "max" | null {
	if (value === "high" || value === "max") return value
	return null
}

function rewriteBody(
	raw: RequestInit["body"] | null | undefined,
	effort: "high" | "max"
): string | undefined {
	if (!raw || typeof raw !== "string") return undefined
	try {
		const obj = JSON.parse(raw) as Record<string, unknown>
		obj.thinking = { type: "adaptive" }
		obj.output_config = { effort }
		return JSON.stringify(obj)
	} catch {
		return undefined
	}
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
