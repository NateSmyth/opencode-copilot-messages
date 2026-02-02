import { describe, expect, it } from "bun:test"
import { CLIENT_ID, type DeviceCodeResponse, type TokenResponse } from "./oauth"

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

type Auth = (input?: AuthInput) => Promise<DeviceCodeResponse>
type Poll = (input: PollInput) => Promise<TokenResponse>

async function load() {
	const oauth = (await import("./oauth")) as {
		authorizeDeviceCode?: Auth
		pollForToken?: Poll
	}

	if (typeof oauth.authorizeDeviceCode !== "function") {
		throw new Error("authorizeDeviceCode not implemented")
	}

	if (typeof oauth.pollForToken !== "function") {
		throw new Error("pollForToken not implemented")
	}

	return {
		authorize: oauth.authorizeDeviceCode,
		poll: oauth.pollForToken,
	}
}

describe("oauth device flow", () => {
	it("authorizeDeviceCode() sends required form fields", async () => {
		const data: DeviceCodeResponse = {
			device_code: "device",
			user_code: "user",
			verification_uri: "https://example.com/verify",
			expires_in: 900,
			interval: 5,
		}

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const path = new URL(req.url).pathname
				expect(path).toBe("/login/device/code")
				expect(req.method).toBe("POST")
				const type = req.headers.get("content-type") ?? ""
				expect(type.includes("application/x-www-form-urlencoded")).toBe(true)
				const accept = req.headers.get("accept") ?? ""
				expect(accept.includes("application/json")).toBe(true)
				const text = await req.text()
				const params = new URLSearchParams(text)
				expect(params.get("client_id")).toBe(CLIENT_ID)
				expect(params.get("scope")).toBe("read:user")
				return Response.json(data)
			},
		})

		const { authorize } = await load()
		const url = `http://127.0.0.1:${server.port}`
		const res = await authorize({ url, fetch })
		server.stop()
		expect(res).toEqual(data)
	})

	it("pollForToken() retries on authorization_pending then returns token", async () => {
		const calls = { value: 0 }
		const data: TokenResponse = {
			access_token: "gho_x",
			token_type: "bearer",
			scope: "read:user",
		}
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const path = new URL(req.url).pathname
				expect(path).toBe("/login/oauth/access_token")
				calls.value += 1
				if (calls.value === 1) {
					return Response.json({
						error: "authorization_pending",
						error_description: "waiting",
					})
				}
				return Response.json(data)
			},
		})

		const waits: number[] = []
		const sleep = async (ms: number) => {
			waits.push(ms)
		}
		const base = 1_700_000_000_000
		const now = () => base
		const { poll } = await load()
		const res = await poll({
			deviceCode: "device",
			interval: 1,
			expiresAt: Math.floor(base / 1000) + 60,
			sleep,
			now,
			url: `http://127.0.0.1:${server.port}`,
			fetch,
		})
		server.stop()
		expect(res).toEqual(data)
		expect(waits).toEqual([1000])
	})

	it("pollForToken() applies slow_down by increasing delay", async () => {
		const calls = { value: 0 }
		const data: TokenResponse = {
			access_token: "gho_s",
			token_type: "bearer",
			scope: "read:user",
		}
		const server = Bun.serve({
			port: 0,
			fetch: async () => {
				calls.value += 1
				if (calls.value === 1) {
					return Response.json({ error: "slow_down", interval: 6 })
				}
				return Response.json(data)
			},
		})

		const waits: number[] = []
		const sleep = async (ms: number) => {
			waits.push(ms)
		}
		const base = 1_700_000_000_000
		const now = () => base
		const { poll } = await load()
		const res = await poll({
			deviceCode: "device",
			interval: 1,
			expiresAt: Math.floor(base / 1000) + 60,
			sleep,
			now,
			url: `http://127.0.0.1:${server.port}`,
			fetch,
		})
		server.stop()
		expect(res).toEqual(data)
		expect(waits).toEqual([6000])
	})

	it("pollForToken() throws on access_denied", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json({ error: "access_denied" }),
		})

		const base = 1_700_000_000_000
		const now = () => base
		const sleep = async (_ms: number) => {}
		const { poll } = await load()
		const run = poll({
			deviceCode: "device",
			interval: 1,
			expiresAt: Math.floor(base / 1000) + 60,
			sleep,
			now,
			url: `http://127.0.0.1:${server.port}`,
			fetch,
		})
		await expect(run).rejects.toThrow("access_denied")
		server.stop()
	})

	it("pollForToken() throws on expired_token", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json({ error: "expired_token" }),
		})

		const base = 1_700_000_000_000
		const now = () => base
		const sleep = async (_ms: number) => {}
		const { poll } = await load()
		const run = poll({
			deviceCode: "device",
			interval: 1,
			expiresAt: Math.floor(base / 1000) + 60,
			sleep,
			now,
			url: `http://127.0.0.1:${server.port}`,
			fetch,
		})
		await expect(run).rejects.toThrow("expired_token")
		server.stop()
	})
})
