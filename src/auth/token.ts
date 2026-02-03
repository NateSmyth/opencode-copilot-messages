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
 * Token format: tid=...;exp=1234567890;... or tid=...;exp=1234567890:mac;...
 */
export function parseTokenExpiration(token: string): number | null {
	const match = token.match(/(?:^|;)exp=([^;:]+)/)
	if (!match) return null
	const value = Number(match[1])
	if (!Number.isFinite(value) || value <= 0) return null
	return Math.floor(value)
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
	const exp = parseTokenExpiration(data.token)

	const expiresAt = (() => {
		const base = (() => {
			if (data.expires_at) return data.expires_at
			if (exp) return exp
			const nowSeconds = Math.floor((input.now ?? Date.now)() / 1000)
			return nowSeconds + data.refresh_in + 60
		})()
		// Clamp to token's exp if it's earlier (defensive against bad expires_at)
		return exp ? Math.min(base, exp) : base
	})()

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
