import { afterAll, beforeAll, describe, expect, it } from "bun:test"
import type { Model } from "@opencode-ai/sdk"
import { CopilotResponsesPlugin } from "./plugin"

type ModelWithVariants = Model & { variants?: Record<string, unknown> }

type HooksShape = {
	config: (input: { provider?: Record<string, unknown> }) => Promise<void>
	auth: {
		provider: string
		methods: Array<{
			type: string
			label: string
			authorize: () => Promise<{
				url: string
				instructions: string
				method: string
				callback: () => Promise<Record<string, unknown>>
			}>
		}>
		loader: (auth: () => Promise<unknown>, provider: unknown) => Promise<Record<string, unknown>>
	}
	"chat.headers": (
		input: { sessionID: string; model: { providerID: string } },
		output: { headers: Record<string, string> }
	) => Promise<void>
}

// Shared mock server and fetch override for end-to-end tests
const captured = {
	device: { client_id: "", scope: "" },
	responses: [] as Array<{
		headers: Record<string, string | null>
		body: unknown
	}>,
}
const state = {
	polls: 0,
	server: null as ReturnType<typeof Bun.serve> | null,
	base: "",
	original: globalThis.fetch,
}

function stubInput(overrides?: Record<string, unknown>) {
	return {
		client: {
			session: {
				get: async (input: unknown) => {
					if (!input || typeof input !== "object") return { data: {} }
					const path = (input as Record<string, unknown>).path as
						| Record<string, unknown>
						| undefined
					if (!path || typeof path.id !== "string") return { data: {} }
					if (path.id === "child") return { data: { parentID: "root" } }
					return { data: {} }
				},
			},
			auth: { set: async () => {} },
			...overrides,
		},
	} as never
}

function serve() {
	return Bun.serve({
		port: 0,
		fetch: async (req) => {
			const url = new URL(req.url)

			if (url.pathname === "/login/device/code") {
				const body = await req.text()
				const params = new URLSearchParams(body)
				captured.device = {
					client_id: params.get("client_id") ?? "",
					scope: params.get("scope") ?? "",
				}
				return Response.json({
					device_code: "dc_test",
					user_code: "ABCD-1234",
					verification_uri: "https://github.com/login/device",
					expires_in: 900,
					interval: 0,
				})
			}

			if (url.pathname === "/login/oauth/access_token") {
				state.polls++
				if (state.polls === 1) {
					return Response.json({ error: "authorization_pending" })
				}
				return Response.json({
					access_token: "gho_test",
					token_type: "bearer",
					scope: "read:user",
				})
			}

			if (url.pathname === "/copilot_internal/user") {
				return Response.json({
					login: "octocat",
					endpoints: { api: state.base },
				})
			}

			if (url.pathname === "/models") {
				return Response.json({
					data: [
						{
							id: "gpt-4o",
							name: "GPT 4o",
							vendor: "openai",
							capabilities: {
								limits: {
									max_context_window_tokens: 128000,
									max_output_tokens: 16384,
								},
								supports: {
									streaming: true,
									tool_calls: true,
									vision: false,
								},
							},
							supported_endpoints: ["/responses"],
						},
						{
							id: "o3",
							name: "o3",
							vendor: "openai",
							capabilities: {
								limits: {
									max_context_window_tokens: 200000,
									max_output_tokens: 100000,
								},
								supports: {
									max_thinking_budget: 32768,
									streaming: true,
									tool_calls: true,
									vision: true,
								},
							},
							supported_endpoints: ["/responses", "/chat/completions"],
						},
						{
							id: "chat-only",
							name: "Chat Only",
							vendor: "openai",
							capabilities: {},
							supported_endpoints: ["/chat/completions"],
						},
					],
				})
			}

			if (url.pathname === "/responses") {
				const hdrs = {
					authorization: req.headers.get("authorization"),
					"x-api-key": req.headers.get("x-api-key"),
					"copilot-integration-id": req.headers.get("copilot-integration-id"),
					"x-github-api-version": req.headers.get("x-github-api-version"),
					"x-initiator": req.headers.get("x-initiator"),
				}
				const body = await req.json().catch(() => null)
				captured.responses.push({ headers: hdrs, body })
				return Response.json({ id: "resp_1", output: [] })
			}

			return new Response("not found", { status: 404 })
		},
	})
}

function forward(base: string, original: typeof fetch) {
	const fn = async (input: string | URL | Request, init?: RequestInit) => {
		const req = input instanceof Request ? input : new Request(input.toString(), init)
		const url = new URL(req.url)
		const target = new URL(url.pathname + url.search, base)
		return original(
			new Request(target.toString(), {
				method: req.method,
				headers: req.headers,
				body: req.body,
			})
		)
	}
	return Object.assign(fn, {
		preconnect: original.preconnect ?? (() => {}),
	}) as typeof fetch
}

beforeAll(() => {
	state.original = globalThis.fetch
	state.server = serve()
	state.base = `http://127.0.0.1:${state.server.port}`
	globalThis.fetch = forward(state.base, state.original)
})

afterAll(() => {
	globalThis.fetch = state.original
	state.server?.stop()
})

// T01: config hook
describe("config hook", () => {
	it("injects copilot-responses provider when absent", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const config = { provider: {} as Record<string, unknown> }
		await hooks.config(config)
		expect(config.provider["copilot-responses"]).toEqual({
			npm: "@ai-sdk/openai",
			name: "Copilot Responses",
			models: {},
		})
	})

	it("does not overwrite existing copilot-responses provider", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const existing = { npm: "custom", name: "Custom", models: { x: 1 } }
		const config = {
			provider: { "copilot-responses": existing } as Record<string, unknown>,
		}
		await hooks.config(config)
		expect(config.provider["copilot-responses"]).toBe(existing)
	})
})

// T02+T03: auth hook contract verified through end-to-end flow
describe("auth authorize end-to-end", () => {
	it("performs device flow with correct client ID and scope, polls for token, checks entitlement", async () => {
		state.polls = 0
		captured.device = { client_id: "", scope: "" }
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape

		// Contract: provider, method type, and label
		expect(hooks.auth.provider).toBe("copilot-responses")
		expect(hooks.auth.methods.length).toBe(1)
		expect(hooks.auth.methods[0].type).toBe("oauth")
		expect(hooks.auth.methods[0].label).toBe("Login with GitHub (Copilot CLI)")

		const auth = await hooks.auth.methods[0].authorize()

		// Contract: authorize shape
		expect(auth.method).toBe("auto")
		expect(typeof auth.callback).toBe("function")

		// E2E: actual device flow
		expect(auth.url).toContain("github.com/login/device")
		expect(auth.instructions).toContain("ABCD-1234")

		const stored = await auth.callback()
		expect(captured.device.client_id).toBe("Ov23ctDVkRmgkPke0Mmm")
		expect(captured.device.scope).toBe("read:user")
		expect(stored.type).toBe("success")
		expect(stored.refresh).toBe("gho_test")
		expect(stored.access).toBe("gho_test")
		expect(stored.expires).toBe(0)
		expect(stored.baseUrl).toBe(state.base)
	})
})

// T04: auth.loader integration
describe("auth loader", () => {
	it("returns empty when no stored auth", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const result = await hooks.auth.loader(async () => null, {})
		expect(result).toEqual({})
	})

	it("returns empty when stored auth has wrong type", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const result = await hooks.auth.loader(async () => ({ type: "api", key: "k" }), {})
		expect(result).toEqual({})
	})

	it("fetches models, merges with existing config, returns openai options", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const stored = {
			type: "oauth",
			refresh: "gho_x",
			access: "gho_x",
			expires: 0,
			baseUrl: state.base,
		}
		const existing: ModelWithVariants = {
			id: "gpt-4o",
			providerID: "copilot-responses",
			name: "GPT 4o",
			api: { id: "gpt-4o", url: state.base, npm: "@ai-sdk/openai" },
			capabilities: {
				temperature: true,
				reasoning: false,
				attachment: false,
				toolcall: true,
				input: {
					text: true,
					audio: false,
					image: false,
					video: false,
					pdf: false,
				},
				output: {
					text: true,
					audio: false,
					image: false,
					video: false,
					pdf: false,
				},
			},
			cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
			limit: { context: 200000, output: 64000 },
			status: "active",
			options: { custom: "keep" },
			headers: { "x-test": "1" },
			variants: { turbo: { reasoning: { effort: "low" } } },
		}
		const provider = {
			models: { "gpt-4o": existing } as Record<string, ModelWithVariants>,
		}

		const result = await hooks.auth.loader(async () => stored, provider as never)

		// Returns openai provider options
		expect(result.name).toBe("openai")
		expect(result.apiKey).toBe("")
		expect(result.baseURL).toBe(state.base)
		expect(typeof result.fetch).toBe("function")

		// Model merge: user config wins for limit, options, headers, variants
		const merged = provider.models["gpt-4o"]
		expect(merged.limit.output).toBe(64000)
		expect(merged.options.custom).toBe("keep")
		expect(merged.headers["x-test"]).toBe("1")
		expect(merged.variants?.turbo).toEqual({ reasoning: { effort: "low" } })

		// New model from server added
		expect(provider.models.o3).toBeDefined()
		expect(provider.models.o3.capabilities.reasoning).toBe(true)

		// chat-only model not included (no /responses endpoint)
		expect(provider.models["chat-only"]).toBeUndefined()
	})

	it("falls back to entitlement fetch when baseUrl is missing and persists it", async () => {
		const calls: Array<Record<string, unknown>> = []
		const hooks = (await CopilotResponsesPlugin(
			stubInput({
				auth: {
					set: async (input: unknown) => {
						calls.push(input as Record<string, unknown>)
					},
				},
			})
		)) as unknown as HooksShape
		const stored = {
			type: "oauth",
			refresh: "gho_x",
			access: "gho_x",
			expires: 0,
			// intentionally no baseUrl
		}
		const provider = { models: {} as Record<string, unknown> }

		const result = await hooks.auth.loader(async () => stored, provider as never)
		expect(result.baseURL).toBe(state.base)
		expect(result.name).toBe("openai")

		// Should have persisted baseUrl back via auth.set
		expect(calls.length).toBeGreaterThan(0)
		const body = (calls[0] as Record<string, unknown>).body as Record<string, unknown>
		expect(body.baseUrl).toBe(state.base)
	})

	it("returned fetch strips x-api-key and injects copilot headers", async () => {
		captured.responses = []
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const stored = {
			type: "oauth",
			refresh: "gho_x",
			access: "gho_x",
			expires: 0,
			baseUrl: state.base,
		}
		const result = await hooks.auth.loader(async () => stored, {
			models: {},
		} as never)
		const doFetch = result.fetch as (req: string, init: RequestInit) => Promise<Response>

		await doFetch(`${state.base}/responses`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"x-api-key": "sk-secret",
				"x-initiator": "agent",
			},
			body: JSON.stringify({ input: [] }),
		})

		expect(captured.responses.length).toBe(1)
		const hdrs = captured.responses[0].headers
		expect(hdrs["x-api-key"]).toBe(null)
		expect(hdrs.authorization).toBe("Bearer gho_x")
		expect(hdrs["copilot-integration-id"]).toBe("copilot-developer-cli")
		expect(hdrs["x-github-api-version"]).toBe("2025-05-01")
		// Caller-supplied x-initiator preserved
		expect(hdrs["x-initiator"]).toBe("agent")
	})
})

// T05: chat.headers hook
describe("chat.headers hook", () => {
	it("sets x-initiator agent for copilot-responses subagent sessions", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const output = { headers: {} as Record<string, string> }
		await hooks["chat.headers"](
			{ sessionID: "child", model: { providerID: "copilot-responses" } },
			output
		)
		expect(output.headers["x-initiator"]).toBe("agent")
	})

	it("does not set header for non-copilot-responses provider", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const output = { headers: {} as Record<string, string> }
		await hooks["chat.headers"]({ sessionID: "child", model: { providerID: "other" } }, output)
		expect(output.headers["x-initiator"]).toBeUndefined()
	})

	it("does not set header for sessions without parentID", async () => {
		const hooks = (await CopilotResponsesPlugin(stubInput())) as unknown as HooksShape
		const output = { headers: {} as Record<string, string> }
		await hooks["chat.headers"](
			{ sessionID: "root", model: { providerID: "copilot-responses" } },
			output
		)
		expect(output.headers["x-initiator"]).toBeUndefined()
	})

	it("tolerates session lookup failure", async () => {
		const hooks = (await CopilotResponsesPlugin({
			client: {
				session: {
					get: async () => {
						throw new Error("lookup failed")
					},
				},
				auth: { set: async () => {} },
			},
		} as never)) as unknown as HooksShape
		const output = { headers: {} as Record<string, string> }
		await hooks["chat.headers"](
			{ sessionID: "any", model: { providerID: "copilot-responses" } },
			output
		)
		expect(output.headers["x-initiator"]).toBeUndefined()
	})
})
