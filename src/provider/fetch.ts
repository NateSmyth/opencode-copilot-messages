/**
 * Custom fetch wrapper for Copilot Messages API.
 *
 * Injects required headers and handles auth.
 */

import { buildHeaders } from "./headers"

export interface FetchContext {
	sessionToken: string
	betaFeatures?: string[]
}

export async function copilotMessagesFetch(
	_input: string | URL | Request,
	_init: RequestInit | undefined,
	context: FetchContext
): Promise<Response> {
	// TODO: Implement copilotMessagesFetch()
	throw new Error("Not implemented")
}
