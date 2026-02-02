/**
 * Session token exchange and refresh for Copilot Messages API.
 *
 * Exchange GitHub PAT for Copilot session token:
 *
 * POST https://api.github.com/copilot_internal/v2/token
 * Headers:
 *   Authorization: token ${githubToken}  // NOTE: "token" not "Bearer"
 *   X-GitHub-Api-Version: 2025-04-01
 *
 * Response: { token, expires_at, refresh_in }
 * Token format: "tid=...;exp=...:mac" (HMAC-signed structured string)
 *
 * Refresh logic: If expires_at < nowSeconds() + 300 (5 min buffer), refresh.
 */

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
		method: "POST",
		headers: {
			Authorization: `token ${input.githubToken}`,
			Accept: "application/json",
			"X-GitHub-Api-Version": "2025-04-01",
		},
	})

	if (!res.ok) {
		throw new Error(`token exchange failed (${res.status}) ${endpoint.pathname}`)
	}

	const data = (await res.json()) as TokenEnvelope
	const nowSeconds = Math.floor((input.now ?? Date.now)() / 1000)
	return {
		token: data.token,
		expiresAt: nowSeconds + data.refresh_in + 60,
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
