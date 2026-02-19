import { buildHeaders } from "./headers"
import { determineInitiator, hasImageContent } from "./initiator"

export interface FetchContext {
	token: string
}

export async function copilotResponsesFetch(
	input: string | URL | Request,
	init: RequestInit | undefined,
	context: FetchContext,
): Promise<Response> {
	const headers = merge(input, init)
	headers.delete("x-api-key")
	const body = readBody(init?.body)
	const initiator =
		forced(headers.get("x-initiator")) ??
		(isInternalAgent(body) ? "agent" : determineInitiator(body.input))
	const images = hasImageContent(body.input)
	const copilot = buildHeaders({
		token: context.token,
		initiator,
		hasImages: images,
	})
	for (const [key, value] of Object.entries(copilot)) {
		headers.set(key, value)
	}
	return fetch(input, { ...init, headers })
}

const decoder = new TextDecoder()

interface ParsedBody {
	input: unknown[]
	instructions?: string | Array<{ type: string; text?: string }>
	system?: string | Array<{ type: string; text?: string }>
}

function merge(input: string | URL | Request, init: RequestInit | undefined): Headers {
	const headers = new Headers(input instanceof Request ? input.headers : undefined)
	if (!init?.headers) return headers
	const incoming = new Headers(init.headers)
	for (const [key, value] of incoming.entries()) {
		headers.set(key, value)
	}
	return headers
}

function readBody(body: RequestInit["body"] | null | undefined): ParsedBody {
	if (!body) return { input: [] }
	if (typeof body === "string") return parse(body)
	if (body instanceof ArrayBuffer) return parse(decoder.decode(body))
	if (ArrayBuffer.isView(body)) return parse(decoder.decode(body))
	return { input: [] }
}

function parse(text: string): ParsedBody {
	try {
		const parsed = JSON.parse(text) as Record<string, unknown>
		return {
			input: Array.isArray(parsed.input) ? (parsed.input as unknown[]) : [],
			instructions: parsed.instructions as ParsedBody["instructions"],
			system: parsed.system as ParsedBody["system"],
		}
	} catch {
		return { input: [] }
	}
}

function isInternalAgent(body: ParsedBody): boolean {
	const prompt = body.instructions ?? body.system
	if (!prompt) return false
	if (typeof prompt === "string") return prompt.startsWith("You are a title generator")
	if (Array.isArray(prompt) && prompt.length > 0) {
		const first = prompt[0]
		if (typeof first === "object" && typeof first.text === "string") {
			return first.text.startsWith("You are a title generator")
		}
	}
	return false
}

function forced(value: string | null): "user" | "agent" | null {
	if (value === "user" || value === "agent") return value
	return null
}
