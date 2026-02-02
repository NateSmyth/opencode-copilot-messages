// Headers that match VSCode Copilot Chat extension
const COPILOT_HEADERS = {
	"User-Agent": "GitHubCopilotChat/0.35.0",
	"Editor-Version": "vscode/1.107.0",
	"Editor-Plugin-Version": "copilot-chat/0.35.0",
	"Copilot-Integration-Id": "vscode-chat",
} as const

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
