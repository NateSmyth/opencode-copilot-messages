import { COPILOT_HEADERS } from "../provider/headers"

export interface TokenEnvelope {
	token: string
	expires_at: number
	refresh_in: number
}

export interface SessionToken {
	token: string
	expiresAt: number
	refreshIn: number
}

/**
 * Parse the expiration timestamp from a Copilot token.
 * Token format: tid=...;exp=1234567890;...
 */
export function parseTokenExpiration(token: string): number | null {
	const match = token.match(/exp=([^;]+)/)
	if (!match) return null
	const exp = Number.parseInt(match[1], 10)
	return Number.isNaN(exp) ? null : exp
}

/**
 * Parse the proxy-ep from a Copilot token and convert to API base URL.
 * Token format: tid=...;exp=...;proxy-ep=proxy.individual.githubcopilot.com;...
 * Returns API URL like https://api.individual.githubcopilot.com
 */
export function getBaseUrlFromToken(token: string): string | null {
	const match = token.match(/proxy-ep=([^;]+)/)
	if (!match) return null
	const proxyHost = match[1]
	// Convert proxy.xxx to api.xxx
	const apiHost = proxyHost.replace(/^proxy\./, "api.")
	return `https://${apiHost}`
}

export async function exchangeForSessionToken(input: {
	githubToken: string
	fetch?: typeof fetch
	url?: string
	now?: () => number
}): Promise<SessionToken> {
	const run = input.fetch ?? fetch
	const base = input.url ?? "https://api.github.com"
	const endpoint = new URL("/copilot_internal/v2/token", base)
	const res = await run(endpoint, {
		method: "GET",
		headers: {
			Authorization: `Bearer ${input.githubToken}`,
			Accept: "application/json",
			...COPILOT_HEADERS,
		},
	})

	if (!res.ok) {
		throw new Error(`token exchange failed (${res.status}) ${endpoint.pathname}`)
	}

	const data = (await res.json()) as TokenEnvelope

	// Prefer envelope expiration, fallback to parsing token, then fallback to calculation
	let expiresAt = data.expires_at
	if (!expiresAt) {
		const parsed = parseTokenExpiration(data.token)
		if (parsed) {
			expiresAt = parsed
		} else {
			const nowSeconds = Math.floor((input.now ?? Date.now)() / 1000)
			expiresAt = nowSeconds + data.refresh_in + 60
		}
	}

	return {
		token: data.token,
		expiresAt,
		refreshIn: data.refresh_in,
	}
}

export function shouldRefreshToken(input: { expiresAt: number; now?: () => number }): boolean {
	const nowSeconds = Math.floor((input.now ?? Date.now)() / 1000)
	return input.expiresAt <= nowSeconds + 300
}

export async function refreshSessionToken(input: {
	githubToken: string
	token: SessionToken
	fetch?: typeof fetch
	url?: string
	now?: () => number
}): Promise<SessionToken> {
	if (!shouldRefreshToken({ expiresAt: input.token.expiresAt, now: input.now })) {
		return input.token
	}

	return exchangeForSessionToken({
		githubToken: input.githubToken,
		fetch: input.fetch,
		url: input.url,
		now: input.now,
	})
}

/**
 * Ensures a valid session token for a request.
 * Call this before every request to the Copilot API to handle token refresh automatically.
 */
export async function ensureFreshToken(input: {
	token: SessionToken
	githubToken: string
	fetch?: typeof fetch
	url?: string
	now?: () => number
}): Promise<SessionToken> {
	return refreshSessionToken(input)
}
