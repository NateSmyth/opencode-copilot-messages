import { describe, expect, it } from "bun:test"
import { CopilotMessagesPlugin } from "./plugin"

describe("CopilotMessagesPlugin hooks", () => {
	it("registers provider and sets initiator for subagents", async () => {
		const hooks = (await CopilotMessagesPlugin({} as never)) as unknown as {
			config?: (input: unknown) => Promise<void>
			"chat.headers"?: (
				input: unknown,
				output: { headers: Record<string, string> }
			) => Promise<void>
		}
		if (!hooks.config || !hooks["chat.headers"]) {
			throw new Error("hooks missing config or chat.headers")
		}

		const configInput = { provider: {} as Record<string, unknown> }
		await hooks.config(configInput as never)
		const provider = configInput.provider as Record<string, unknown>
		expect(provider["copilot-messages"]).toEqual({
			npm: "@ai-sdk/anthropic",
			name: "Copilot Messages",
			models: {},
		})

		const headersInput = {
			provider: { info: { id: "copilot-messages" } },
			message: { metadata: { parentSessionId: "parent" } },
		}
		const headersRes = { headers: {} as Record<string, string> }
		await hooks["chat.headers"](headersInput as never, headersRes)
		expect(headersRes.headers["x-initiator"]).toBe("agent")

		const otherRes = { headers: {} as Record<string, string> }
		await hooks["chat.headers"](
			{
				provider: { info: { id: "other" } },
				message: { metadata: { parentSessionId: "parent" } },
			} as never,
			otherRes
		)
		expect(otherRes.headers["x-initiator"]).toBeUndefined()

		const userRes = { headers: {} as Record<string, string> }
		await hooks["chat.headers"](
			{
				provider: { info: { id: "copilot-messages" } },
				message: { metadata: {} },
			} as never,
			userRes
		)
		expect(userRes.headers["x-initiator"]).toBeUndefined()
	})

	it("auth loader returns init config and wires fetch", async () => {
		const auth = {
			type: "oauth",
			refresh: "gho_refresh",
			access: "session_old",
			expires: Date.now() + 60_000,
		} as const
		const calls: string[] = []
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const url = new URL(req.url)
				calls.push(url.pathname)
				if (url.pathname === "/login/device/code") {
					return Response.json({
						device_code: "device",
						user_code: "user",
						verification_uri: "https://example.com/verify",
						expires_in: 900,
						interval: 1,
					})
				}
				if (url.pathname === "/login/oauth/access_token") {
					return Response.json({
						access_token: "gho_refresh",
						token_type: "bearer",
						scope: "read:user",
					})
				}
				if (url.pathname === "/copilot_internal/v2/token") {
					return Response.json({
						token: "tid=1;exp=999:mac",
						expires_at: 999,
						refresh_in: 120,
					})
				}
				if (url.pathname === "/models") {
					return Response.json({
						data: [
							{
								id: "claude-messages",
								name: "claude-messages",
								vendor: "anthropic",
								capabilities: {
									family: "claude",
									limits: {
										max_context_window_tokens: 100,
										max_output_tokens: 10,
										max_prompt_tokens: 100,
									},
									supports: {
										max_thinking_budget: 128,
										min_thinking_budget: 64,
										streaming: true,
										tool_calls: true,
										vision: false,
									},
								},
								supported_endpoints: ["/v1/messages"],
							},
						],
					})
				}
				if (url.pathname === "/v1/messages") {
					const authHeader = req.headers.get("authorization")
					expect(authHeader).toBe("Bearer tid=1;exp=999:mac")
					expect(req.headers.get("x-api-key")).toBe(null)
					expect(req.headers.get("x-keep")).toBe("1")
					return Response.json({ ok: true })
				}
				return new Response("not-found", { status: 404 })
			},
		})
		const base = `http://127.0.0.1:${server.port}`
		const originalFetch = globalThis.fetch
		const forward = async (input: string | URL | Request, init?: RequestInit) => {
			const req = input instanceof Request ? input : new Request(input.toString(), init)
			const url = new URL(req.url)
			const target = new URL(url.pathname + url.search, base)
			const next = new Request(target.toString(), {
				method: req.method,
				headers: req.headers,
				body: req.body,
			})
			return originalFetch(next)
		}
		const mock = Object.assign(forward, {
			preconnect: originalFetch.preconnect ?? ((_url: string) => {}),
		}) as typeof fetch
		globalThis.fetch = mock

		const hooks = (await CopilotMessagesPlugin({
			client: { auth: { set: async (_input: unknown) => {} } },
		} as never)) as unknown as {
			auth?: {
				loader?: (
					auth: () => Promise<unknown>,
					provider: unknown
				) => Promise<Record<string, unknown>>
			}
		}
		if (!hooks.auth?.loader) {
			throw new Error("hooks missing auth.loader")
		}
		const provider = { models: {} as Record<string, unknown> }
		try {
			const res = await hooks.auth.loader(async () => auth, provider as never)
			expect(res.apiKey).toBe("")
			expect(res.baseURL).toBe("https://api.githubcopilot.com/v1")
			expect(typeof res.fetch).toBe("function")
			expect(Object.keys(provider.models)).toEqual(["claude-messages"])

			const body = JSON.stringify({ messages: [{ role: "user", content: "hi" }] })
			await (res.fetch as (req: string, init: RequestInit) => Promise<Response>)(
				`${base}/v1/messages`,
				{
					method: "POST",
					headers: { "content-type": "application/json", "x-api-key": "k", "x-keep": "1" },
					body,
				}
			)
			server.stop()
			globalThis.fetch = originalFetch
			expect(calls.includes("/models")).toBe(true)
		} finally {
			server.stop()
			globalThis.fetch = originalFetch
		}
	})
})
