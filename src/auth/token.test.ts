import { describe, expect, it } from "bun:test"
import type { SessionToken, TokenEnvelope } from "./token"

type ExchangeInput = {
	githubToken: string
	fetch?: typeof fetch
	url?: string
	now?: () => number
}

type RefreshInput = {
	githubToken: string
	token: SessionToken
	fetch?: typeof fetch
	url?: string
	now?: () => number
}

type Exchange = (input: ExchangeInput) => Promise<SessionToken>
type Refresh = (input: RefreshInput) => Promise<SessionToken>

async function load() {
	const token = (await import("./token")) as {
		exchangeForSessionToken?: Exchange
		shouldRefreshToken?: (input: {
			expiresAt: number
			token?: string
			now?: () => number
		}) => boolean
		refreshSessionToken?: Refresh
		parseTokenExpiration?: (token: string) => number | null
	}

	if (typeof token.exchangeForSessionToken !== "function") {
		throw new Error("exchangeForSessionToken not implemented")
	}

	if (typeof token.shouldRefreshToken !== "function") {
		throw new Error("shouldRefreshToken not implemented")
	}

	if (typeof token.refreshSessionToken !== "function") {
		throw new Error("refreshSessionToken not implemented")
	}

	// Optional for now until implemented
	// if (typeof token.parseTokenExpiration !== "function") {
	// 	throw new Error("parseTokenExpiration not implemented")
	// }

	return {
		exchange: token.exchangeForSessionToken,
		shouldRefresh: token.shouldRefreshToken,
		refresh: token.refreshSessionToken,
		parseExpiration: token.parseTokenExpiration,
	}
}

describe("session token parsing", () => {
	it("parseTokenExpiration() extracts exp value", async () => {
		const { parseExpiration } = await load()
		if (!parseExpiration) throw new Error("parseExpiration not implemented")

		expect(parseExpiration("tid=1;exp=1234567890;foo=bar")).toBe(1234567890)
		expect(parseExpiration("exp=1234567890;foo=bar")).toBe(1234567890)
		expect(parseExpiration("foo=bar;exp=1234567890")).toBe(1234567890)
	})

	it("parseTokenExpiration() returns null for invalid/missing exp", async () => {
		const { parseExpiration } = await load()
		if (!parseExpiration) throw new Error("parseExpiration not implemented")

		expect(parseExpiration("tid=1;foo=bar")).toBe(null)
		expect(parseExpiration("exp=invalid")).toBe(null)
	})

	it("parseTokenExpiration() does not match noexp or similar prefixes", async () => {
		const { parseExpiration } = await load()
		if (!parseExpiration) throw new Error("parseExpiration not implemented")

		expect(parseExpiration("noexp=123")).toBe(null)
		expect(parseExpiration("tid=1;noexp=123")).toBe(null)
		expect(parseExpiration("tid=1;tokenexp=123")).toBe(null)
	})

	it("parseTokenExpiration() handles MAC suffix after exp value", async () => {
		const { parseExpiration } = await load()
		if (!parseExpiration) throw new Error("parseExpiration not implemented")

		expect(parseExpiration("tid=1;exp=1234567890:mac")).toBe(1234567890)
		expect(parseExpiration("exp=999:somemac;foo=bar")).toBe(999)
	})

	it("parseTokenExpiration() rejects zero and negative values", async () => {
		const { parseExpiration } = await load()
		if (!parseExpiration) throw new Error("parseExpiration not implemented")

		expect(parseExpiration("exp=0")).toBe(null)
		expect(parseExpiration("exp=-1")).toBe(null)
	})
})

describe("session token exchange", () => {
	const base = 1_700_000_000_000
	const now = () => base
	const nowSeconds = Math.floor(base / 1000)

	it("exchangeForSessionToken() sends required headers and uses envelope.expires_at", async () => {
		const expTime = nowSeconds + 2000 // exp is later than expires_at, so expires_at wins
		const envelope: TokenEnvelope = {
			token: `tid=1;exp=${expTime}`,
			expires_at: nowSeconds + 1234, // Explicit expiration (earlier than exp)
			refresh_in: 120,
		}

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const path = new URL(req.url).pathname
				expect(path).toBe("/copilot_internal/v2/token")
				const auth = req.headers.get("authorization")
				expect(auth).toBe("Bearer ghp_test")
				const accept = req.headers.get("accept") ?? ""
				expect(accept.includes("application/json")).toBe(true)
				// Verify COPILOT_HEADERS are present
				expect(req.headers.get("user-agent")).toBe("GitHubCopilotChat/0.35.0")
				expect(req.headers.get("editor-version")).toBe("vscode/1.107.0")
				return Response.json(envelope)
			},
		})

		const { exchange } = await load()
		const res = await exchange({
			githubToken: "ghp_test",
			url: `http://127.0.0.1:${server.port}`,
			now,
			fetch,
		})
		server.stop()
		expect(res.token).toBe(envelope.token)
		expect(res.refreshIn).toBe(envelope.refresh_in)
		expect(res.expiresAt).toBe(envelope.expires_at) // Should use envelope.expires_at
	})

	it("exchangeForSessionToken() clamps expiresAt to token exp when exp is earlier", async () => {
		const tokenExp = nowSeconds + 500
		const envelope: TokenEnvelope = {
			token: `tid=1;exp=${tokenExp}`,
			expires_at: nowSeconds + 1000, // Envelope says 1000s, but token says 500s
			refresh_in: 120,
		}

		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json(envelope),
		})

		const { exchange } = await load()
		const res = await exchange({
			githubToken: "ghp_test",
			url: `http://127.0.0.1:${server.port}`,
			now,
			fetch,
		})
		server.stop()
		expect(res.expiresAt).toBe(tokenExp) // Should clamp to the earlier exp
	})

	it("shouldRefreshToken() returns false outside 5-minute window", async () => {
		const { shouldRefresh } = await load()
		const res = shouldRefresh({ expiresAt: nowSeconds + 301, now })
		expect(res).toBe(false)
	})

	it("shouldRefreshToken() returns true at/inside 5-minute window", async () => {
		const { shouldRefresh } = await load()
		expect(shouldRefresh({ expiresAt: nowSeconds + 300, now })).toBe(true)
		expect(shouldRefresh({ expiresAt: nowSeconds + 1, now })).toBe(true)
	})

	it("shouldRefreshToken() forces refresh when token exp is already expired", async () => {
		const { shouldRefresh } = await load()
		const expiredToken = `tid=1;exp=${nowSeconds - 100}` // exp is 100 seconds ago
		// Even though expiresAt says 10 minutes in the future, token's exp is expired
		expect(shouldRefresh({ expiresAt: nowSeconds + 600, token: expiredToken, now })).toBe(true)
	})

	it("refreshSessionToken() returns same token when not due", async () => {
		const futureExp = nowSeconds + 600 // Token exp is well in the future
		const original: SessionToken = {
			token: `tid=1;exp=${futureExp}`,
			expiresAt: nowSeconds + 301,
			refreshIn: 120,
		}
		const run = async () => {
			throw new Error("fetch should not run")
		}

		const { refresh } = await load()
		const res = await refresh({
			githubToken: "ghp_test",
			token: original,
			fetch: run as unknown as typeof fetch,
			now,
		})
		expect(res).toEqual(original)
	})

	it("refreshSessionToken() exchanges when due", async () => {
		const original: SessionToken = {
			token: "tid=1;exp=999:mac",
			expiresAt: nowSeconds + 1,
			refreshIn: 120,
		}
		const newExp = nowSeconds + 2000
		const envelope: TokenEnvelope = {
			token: `tid=2;exp=${newExp}`,
			expires_at: nowSeconds + 2000,
			refresh_in: 180,
		}

		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json(envelope),
		})

		const { refresh } = await load()
		const res = await refresh({
			githubToken: "ghp_test",
			token: original,
			url: `http://127.0.0.1:${server.port}`,
			now,
			fetch,
		})
		server.stop()
		expect(res.token).toBe(envelope.token)
		expect(res.expiresAt).toBe(envelope.expires_at)
	})
})
