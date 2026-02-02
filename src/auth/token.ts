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
