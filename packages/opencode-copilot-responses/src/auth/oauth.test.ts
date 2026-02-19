import { describe, expect, it } from "bun:test"

type DeviceCodeResponse = {
	device_code: string
	user_code: string
	verification_uri: string
	expires_in: number
	interval: number
}

type TokenResponse = {
	access_token: string
	token_type: string
	scope: string
}

type AuthInput = {
	fetch?: typeof fetch
	url?: string
	clientId?: string
	scope?: string
}

type PollInput = {
	deviceCode: string
	interval: number
	expiresAt: number
	fetch?: typeof fetch
	url?: string
	clientId?: string
	sleep?: (ms: number) => Promise<void>
	now?: () => number
}

async function load() {
	const mod = (await import("./oauth")) as {
		authorizeDeviceCode?: (input?: AuthInput) => Promise<DeviceCodeResponse>
		pollForToken?: (input: PollInput) => Promise<TokenResponse>
		CLIENT_ID?: string
	}
	if (typeof mod.authorizeDeviceCode !== "function") throw new Error("authorizeDeviceCode missing")
	if (typeof mod.pollForToken !== "function") throw new Error("pollForToken missing")
	if (typeof mod.CLIENT_ID !== "string") throw new Error("CLIENT_ID missing")
	return mod as Required<typeof mod>
}

describe("authorizeDeviceCode", () => {
	it("POSTs form-encoded body with correct client ID and scope", async () => {
		const fixture: DeviceCodeResponse = {
			device_code: "dc_abc",
			user_code: "ABCD-1234",
			verification_uri: "https://github.com/login/device",
			expires_in: 900,
			interval: 5,
		}

		const server = Bun.serve({
			port: 0,
			async fetch(req) {
				const path = new URL(req.url).pathname
				expect(path).toBe("/login/device/code")
				expect(req.method).toBe("POST")

				const type = req.headers.get("content-type") ?? ""
				expect(type).toContain("application/x-www-form-urlencoded")
				expect(req.headers.get("accept")).toContain("application/json")

				const params = new URLSearchParams(await req.text())
				expect(params.get("client_id")).toBe("Ov23ctDVkRmgkPke0Mmm")
				expect(params.get("scope")).toBe("read:user")
				return Response.json(fixture)
			},
		})

		try {
			const { authorizeDeviceCode } = await load()
			const res = await authorizeDeviceCode({
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			expect(res).toEqual(fixture)
		} finally {
			server.stop()
		}
	})

	it("uses the exported CLIENT_ID constant", async () => {
		const { CLIENT_ID } = await load()
		expect(CLIENT_ID).toBe("Ov23ctDVkRmgkPke0Mmm")
	})

	it("throws on non-OK response", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => new Response("bad", { status: 500 }),
		})

		try {
			const { authorizeDeviceCode } = await load()
			const run = authorizeDeviceCode({
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow(/500/)
		} finally {
			server.stop()
		}
	})
})

describe("pollForToken", () => {
	const base = 1_700_000_000_000
	const now = () => base
	const expiresAt = Math.floor(base / 1000) + 60

	it("retries on authorization_pending then returns token", async () => {
		const calls = { count: 0 }
		const token: TokenResponse = {
			access_token: "gho_test123",
			token_type: "bearer",
			scope: "read:user",
		}
		const server = Bun.serve({
			port: 0,
			async fetch(req) {
				expect(new URL(req.url).pathname).toBe("/login/oauth/access_token")

				const params = new URLSearchParams(await req.text())
				expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code")
				expect(params.get("client_id")).toBe("Ov23ctDVkRmgkPke0Mmm")

				calls.count += 1
				if (calls.count === 1) {
					return Response.json({ error: "authorization_pending" })
				}
				return Response.json(token)
			},
		})

		const waits: number[] = []
		try {
			const { pollForToken } = await load()
			const res = await pollForToken({
				deviceCode: "dc_abc",
				interval: 5,
				expiresAt,
				sleep: async (ms) => {
					waits.push(ms)
				},
				now,
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			expect(res).toEqual(token)
			expect(waits).toEqual([5000])
		} finally {
			server.stop()
		}
	})

	it("increases delay on slow_down with server-provided interval", async () => {
		const calls = { count: 0 }
		const token: TokenResponse = {
			access_token: "gho_slow",
			token_type: "bearer",
			scope: "read:user",
		}
		const server = Bun.serve({
			port: 0,
			async fetch() {
				calls.count += 1
				if (calls.count === 1) {
					return Response.json({ error: "slow_down", interval: 10 })
				}
				return Response.json(token)
			},
		})

		const waits: number[] = []
		try {
			const { pollForToken } = await load()
			const res = await pollForToken({
				deviceCode: "dc_abc",
				interval: 5,
				expiresAt,
				sleep: async (ms) => {
					waits.push(ms)
				},
				now,
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			expect(res).toEqual(token)
			expect(waits).toEqual([10_000])
		} finally {
			server.stop()
		}
	})

	it("falls back to interval+5 when slow_down has no interval", async () => {
		const calls = { count: 0 }
		const token: TokenResponse = {
			access_token: "gho_fallback",
			token_type: "bearer",
			scope: "read:user",
		}
		const server = Bun.serve({
			port: 0,
			async fetch() {
				calls.count += 1
				if (calls.count === 1) {
					return Response.json({ error: "slow_down" })
				}
				return Response.json(token)
			},
		})

		const waits: number[] = []
		try {
			const { pollForToken } = await load()
			const res = await pollForToken({
				deviceCode: "dc_abc",
				interval: 5,
				expiresAt,
				sleep: async (ms) => {
					waits.push(ms)
				},
				now,
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			expect(res).toEqual(token)
			expect(waits).toEqual([10_000])
		} finally {
			server.stop()
		}
	})

	it("throws on access_denied", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => Response.json({ error: "access_denied" }),
		})

		try {
			const { pollForToken } = await load()
			const run = pollForToken({
				deviceCode: "dc_abc",
				interval: 5,
				expiresAt,
				sleep: async () => {},
				now,
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow("access_denied")
		} finally {
			server.stop()
		}
	})

	it("throws on expired_token from server", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => Response.json({ error: "expired_token" }),
		})

		try {
			const { pollForToken } = await load()
			const run = pollForToken({
				deviceCode: "dc_abc",
				interval: 5,
				expiresAt,
				sleep: async () => {},
				now,
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow("expired_token")
		} finally {
			server.stop()
		}
	})

	it("throws expired_token when time exceeds expiresAt", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => Response.json({ error: "authorization_pending" }),
		})

		const expired = Math.floor(base / 1000) - 1
		try {
			const { pollForToken } = await load()
			const run = pollForToken({
				deviceCode: "dc_abc",
				interval: 5,
				expiresAt: expired,
				sleep: async () => {},
				now,
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow("expired_token")
		} finally {
			server.stop()
		}
	})
})
