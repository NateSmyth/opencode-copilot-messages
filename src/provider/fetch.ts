/**
 * Custom fetch wrapper for Copilot Messages API.
 *
 * Injects required headers and handles auth.
 */

import { buildHeaders } from "./headers"
import { determineInitiator, hasImageContent, type AnthropicMessage } from "./initiator"

export interface FetchContext {
	sessionToken: string
	betaFeatures?: string[]
}

export async function copilotMessagesFetch(
	input: string | URL | Request,
	init: RequestInit | undefined,
	context: FetchContext
): Promise<Response> {
	const headers = merge(input, init)
	headers.delete("x-api-key")
	const messages = await read(init?.body)
	const initiator = determineInitiator(messages)
	const images = hasImageContent(messages)
	const copilot = buildHeaders({
		sessionToken: context.sessionToken,
		initiator,
		hasImages: images,
		betaFeatures: context.betaFeatures,
	})

	for (const [key, value] of Object.entries(copilot)) {
		headers.set(key, value)
	}

	return fetch(input, {
		...init,
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

async function read(body: RequestInit["body"] | null | undefined): Promise<AnthropicMessage[]> {
	if (!body) return []
	if (typeof body === "string") return parse(body)
	if (body instanceof ArrayBuffer) return parse(decoder.decode(body))
	if (ArrayBuffer.isView(body)) return parse(decoder.decode(body))
	return []
}

function parse(text: string): AnthropicMessage[] {
	const parsed = (() => {
		try {
			return JSON.parse(text) as { messages?: unknown }
		} catch {
			return null
		}
	})()
	if (!parsed || !Array.isArray(parsed.messages)) return []
	return parsed.messages as AnthropicMessage[]
}
