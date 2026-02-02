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
		shouldRefreshToken?: (input: { expiresAt: number; now?: () => number }) => boolean
		refreshSessionToken?: Refresh
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

	return {
		exchange: token.exchangeForSessionToken,
		shouldRefresh: token.shouldRefreshToken,
		refresh: token.refreshSessionToken,
	}
}

describe("session token exchange", () => {
	const base = 1_700_000_000_000
	const now = () => base
	const nowSeconds = Math.floor(base / 1000)

	it("exchangeForSessionToken() sends required headers and adjusts expiry", async () => {
		const envelope: TokenEnvelope = {
			token: "tid=1;exp=999:mac",
			expires_at: 999,
			refresh_in: 120,
		}

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const path = new URL(req.url).pathname
				expect(path).toBe("/copilot_internal/v2/token")
				const auth = req.headers.get("authorization")
				expect(auth).toBe("token ghp_test")
				const version = req.headers.get("x-github-api-version")
				expect(version).toBe("2025-04-01")
				const accept = req.headers.get("accept") ?? ""
				expect(accept.includes("application/json")).toBe(true)
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
		expect(res.expiresAt).toBe(nowSeconds + 120 + 60)
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

	it("refreshSessionToken() returns same token when not due", async () => {
		const original: SessionToken = {
			token: "tid=1;exp=999:mac",
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
		const envelope: TokenEnvelope = {
			token: "tid=2;exp=999:mac",
			expires_at: 999,
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
		const expected = nowSeconds + envelope.refresh_in + 60
		expect(res.expiresAt).toBe(expected)
	})
})
