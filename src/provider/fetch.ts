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
	_input: string | URL | Request,
	_init: RequestInit | undefined,
	context: FetchContext
): Promise<Response> {
	const input = _input
	const init = _init
	const headers = new Headers()

	if (input instanceof Request) {
		for (const [key, value] of input.headers.entries()) {
			headers.set(key, value)
		}
	}

	if (init?.headers) {
		const incoming = new Headers(init.headers)
		for (const [key, value] of incoming.entries()) {
			headers.set(key, value)
		}
	}

	headers.delete("x-api-key")

	const body = init?.body
	const text = await readBody(body)
	const parsed = parseBody(text)
	const messages = parsed.messages
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

async function readBody(body: RequestInit["body"] | null | undefined): Promise<string | null> {
	if (!body) return null
	if (typeof body === "string") return body
	if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
	if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body)
	return null
}

function parseBody(text: string | null): { messages: AnthropicMessage[] } {
	if (!text) return { messages: [] }

	const parsed = (() => {
		try {
			return JSON.parse(text) as { messages?: unknown }
		} catch {
			return null
		}
	})()

	if (!parsed || !Array.isArray(parsed.messages)) return { messages: [] }
	return { messages: parsed.messages as AnthropicMessage[] }
}
