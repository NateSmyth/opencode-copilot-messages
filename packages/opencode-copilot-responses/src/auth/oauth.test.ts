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

async function load() {
	const mod = (await import("./oauth")) as {
		authorizeDeviceCode?: (input?: Record<string, unknown>) => Promise<DeviceCodeResponse>
		pollForToken?: (input: Record<string, unknown>) => Promise<TokenResponse>
		CLIENT_ID?: string
	}
	if (typeof mod.authorizeDeviceCode !== "function") throw new Error("authorizeDeviceCode missing")
	if (typeof mod.pollForToken !== "function") throw new Error("pollForToken missing")
	if (typeof mod.CLIENT_ID !== "string") throw new Error("CLIENT_ID missing")
	return mod as Required<typeof mod>
}

async function withServer(
	handler: (req: Request) => Response | Promise<Response>,
	run: (url: string) => Promise<void>
) {
	const server = Bun.serve({ port: 0, fetch: handler })
	try {
		await run(`http://127.0.0.1:${server.port}`)
	} finally {
		server.stop()
	}
}

const BASE_TIME = 1_700_000_000_000
const NOW = () => BASE_TIME
const EXPIRES = Math.floor(BASE_TIME / 1000) + 60

function polling(url: string, overrides?: Record<string, unknown>) {
	const waits: number[] = []
	return {
		waits,
		input: {
			deviceCode: "dc_abc",
			interval: 5,
			expiresAt: EXPIRES,
			sleep: async (ms: number) => {
				waits.push(ms)
			},
			now: NOW,
			url,
			fetch,
			...overrides,
		},
	}
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

		await withServer(
			async (req) => {
				const path = new URL(req.url).pathname
				expect(path).toBe("/login/device/code")
				expect(req.method).toBe("POST")

				const type = req.headers.get("content-type") ?? ""
				expect(type).toContain("application/x-www-form-urlencoded")
				expect(req.headers.get("user-agent")).toBeTruthy()
				expect(req.headers.get("accept")).toContain("application/json")

				const params = new URLSearchParams(await req.text())
				expect(params.get("client_id")).toBe("Ov23ctDVkRmgkPke0Mmm")
				expect(params.get("scope")).toBe("read:user")
				return Response.json(fixture)
			},
			async (url) => {
				const { authorizeDeviceCode } = await load()
				const res = await authorizeDeviceCode({ url, fetch })
				expect(res).toEqual(fixture)
			}
		)
	})

	it("uses the exported CLIENT_ID constant", async () => {
		const { CLIENT_ID } = await load()
		expect(CLIENT_ID).toBe("Ov23ctDVkRmgkPke0Mmm")
	})

	it("throws on non-OK response", async () => {
		await withServer(
			() => new Response("bad", { status: 500 }),
			async (url) => {
				const { authorizeDeviceCode } = await load()
				const run = authorizeDeviceCode({ url, fetch })
				await expect(run).rejects.toThrow(/500/)
			}
		)
	})
})

describe("pollForToken", () => {
	it("retries on authorization_pending then returns token", async () => {
		const calls = { count: 0 }
		const token: TokenResponse = {
			access_token: "gho_test123",
			token_type: "bearer",
			scope: "read:user",
		}

		await withServer(
			async (req) => {
				expect(new URL(req.url).pathname).toBe("/login/oauth/access_token")

				expect(req.headers.get("user-agent")).toBeTruthy()
				const params = new URLSearchParams(await req.text())
				expect(params.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:device_code")
				expect(params.get("client_id")).toBe("Ov23ctDVkRmgkPke0Mmm")

				calls.count += 1
				if (calls.count === 1) {
					return Response.json({ error: "authorization_pending" })
				}
				return Response.json(token)
			},
			async (url) => {
				const { waits, input } = polling(url)
				const { pollForToken } = await load()
				const res = await pollForToken(input)
				expect(res).toEqual(token)
				expect(waits).toEqual([5000])
			}
		)
	})

	it("increases delay on slow_down with server-provided interval", async () => {
		const calls = { count: 0 }
		const token: TokenResponse = {
			access_token: "gho_slow",
			token_type: "bearer",
			scope: "read:user",
		}

		await withServer(
			async () => {
				calls.count += 1
				if (calls.count === 1) {
					return Response.json({ error: "slow_down", interval: 10 })
				}
				return Response.json(token)
			},
			async (url) => {
				const { waits, input } = polling(url)
				const { pollForToken } = await load()
				const res = await pollForToken(input)
				expect(res).toEqual(token)
				expect(waits).toEqual([10_000])
			}
		)
	})

	it("falls back to interval+5 when slow_down has no interval", async () => {
		const calls = { count: 0 }
		const token: TokenResponse = {
			access_token: "gho_fallback",
			token_type: "bearer",
			scope: "read:user",
		}

		await withServer(
			async () => {
				calls.count += 1
				if (calls.count === 1) {
					return Response.json({ error: "slow_down" })
				}
				return Response.json(token)
			},
			async (url) => {
				const { waits, input } = polling(url)
				const { pollForToken } = await load()
				const res = await pollForToken(input)
				expect(res).toEqual(token)
				expect(waits).toEqual([10_000])
			}
		)
	})

	it("throws on access_denied", async () => {
		await withServer(
			() => Response.json({ error: "access_denied" }),
			async (url) => {
				const { input } = polling(url)
				const { pollForToken } = await load()
				await expect(pollForToken(input)).rejects.toThrow("access_denied")
			}
		)
	})

	it("throws on expired_token from server", async () => {
		await withServer(
			() => Response.json({ error: "expired_token" }),
			async (url) => {
				const { input } = polling(url)
				const { pollForToken } = await load()
				await expect(pollForToken(input)).rejects.toThrow("expired_token")
			}
		)
	})

	it("throws expired_token when time exceeds expiresAt", async () => {
		const expired = Math.floor(BASE_TIME / 1000) - 1

		await withServer(
			() => Response.json({ error: "authorization_pending" }),
			async (url) => {
				const { input } = polling(url, { expiresAt: expired })
				const { pollForToken } = await load()
				await expect(pollForToken(input)).rejects.toThrow("expired_token")
			}
		)
	})
})
