import { describe, expect, it } from "bun:test"
import type { Model } from "@opencode-ai/sdk"
import type { CopilotModel } from "./registry"

type FetchInput = {
	sessionToken: string
	fetch?: typeof fetch
	url?: string
	betaFeatures?: string[]
}

type FetchModels = (input: FetchInput) => Promise<Model[]>

async function load() {
	const registry = (await import("./registry")) as {
		fetchModels?: FetchModels
	}

	if (typeof registry.fetchModels !== "function") {
		throw new Error("fetchModels not implemented")
	}

	return registry.fetchModels
}

const make = (id: string, endpoints: string[]): CopilotModel => ({
	id,
	name: id,
	vendor: "anthropic",
	capabilities: {
		family: "claude",
		limits: {
			max_context_window_tokens: 120000,
			max_output_tokens: 4096,
			max_prompt_tokens: 120000,
		},
		supports: {
			max_thinking_budget: 1024,
			min_thinking_budget: 128,
			streaming: true,
			tool_calls: true,
			vision: false,
		},
	},
	supported_endpoints: endpoints,
})

const makeAdaptive = (id: string, endpoints: string[]): CopilotModel => ({
	id,
	name: id,
	vendor: "anthropic",
	capabilities: {
		family: "claude-opus-4.6",
		limits: {
			max_context_window_tokens: 200000,
			max_output_tokens: 64000,
			max_prompt_tokens: 128000,
		},
		supports: {
			adaptive_thinking: true,
			structured_outputs: true,
			max_thinking_budget: 32000,
			min_thinking_budget: 1024,
			streaming: true,
			tool_calls: true,
			vision: true,
			parallel_tool_calls: true,
		} as Record<string, unknown>,
	},
	supported_endpoints: endpoints,
})

describe("copilot model registry", () => {
	it("fetchModels() requests /models with required headers and maps results", async () => {
		const models = [
			make("claude-messages", ["/v1/messages", "/v1/other"]),
			make("claude-chat", ["/v1/chat"]),
		]

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const url = new URL(req.url)
				expect(url.pathname).toBe("/models")
				expect(req.method).toBe("GET")

				const auth = req.headers.get("authorization") ?? ""
				expect(auth.startsWith("Bearer ")).toBe(true)
				const agent = req.headers.get("user-agent") ?? ""
				expect(agent.length).toBeGreaterThan(0)
				const editor = req.headers.get("editor-version") ?? ""
				expect(editor.length).toBeGreaterThan(0)
				const plugin = req.headers.get("editor-plugin-version") ?? ""
				expect(plugin.length).toBeGreaterThan(0)
				const integration = req.headers.get("copilot-integration-id") ?? ""
				expect(integration.length).toBeGreaterThan(0)
				const requestId = req.headers.get("x-request-id") ?? ""
				expect(requestId.length).toBeGreaterThan(0)
				const version = req.headers.get("x-github-api-version") ?? ""
				expect(version.length).toBeGreaterThan(0)
				const interaction = req.headers.get("x-interaction-type") ?? ""
				expect(interaction).toBe("model-access")
				const intent = req.headers.get("openai-intent") ?? ""
				expect(intent).toBe("model-access")

				return Response.json({ data: models })
			},
		})

		const fetchModels = await load()
		const url = `http://127.0.0.1:${server.port}`
		const res = await fetchModels({ sessionToken: "session", url, fetch })
		server.stop()

		expect(res.length).toBe(1)
		expect(res[0]).toEqual({
			id: "claude-messages",
			providerID: "copilot-messages",
			name: "claude-messages",
			api: {
				id: "claude-messages",
				url: "https://api.githubcopilot.com/v1",
				npm: "@ai-sdk/anthropic",
			},
			capabilities: {
				temperature: true,
				reasoning: true,
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
			cost: {
				input: 0,
				output: 0,
				cache: {
					read: 0,
					write: 0,
				},
			},
			limit: {
				context: 120000,
				output: 4096,
			},
			status: "active",
			options: {
				adaptiveThinking: false,
				maxThinkingBudget: 1024,
				minThinkingBudget: 128,
			},
			headers: {},
		})
	})

	it("fetchModels() accepts common response envelopes", async () => {
		const model = make("claude-messages", ["/v1/messages"])
		const list = [model]
		const cases = [list, { data: list }, { models: list }]
		const calls = { value: 0 }

		const server = Bun.serve({
			port: 0,
			fetch: async () => {
				const index = calls.value
				calls.value += 1
				const body = cases[index] ?? list
				return Response.json(body)
			},
		})

		const fetchModels = await load()
		const url = `http://127.0.0.1:${server.port}`
		for (const _case of cases) {
			const res = await fetchModels({ sessionToken: "session", url, fetch })
			expect(res.length).toBe(1)
			expect(res[0].id).toBe(model.id)
		}
		server.stop()
	})

	it("maps adaptive_thinking capability to options.adaptiveThinking", async () => {
		const models = [makeAdaptive("claude-opus-4-6", ["/v1/messages"])]

		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json({ data: models }),
		})

		const fetchModels = await load()
		const url = `http://127.0.0.1:${server.port}`
		const res = await fetchModels({ sessionToken: "session", url, fetch })
		server.stop()

		expect(res.length).toBe(1)
		const model = res[0]
		expect(model.options.adaptiveThinking).toBe(true)
		expect(model.options.maxThinkingBudget).toBe(32000)
		expect(model.options.minThinkingBudget).toBe(1024)
		expect(model.limit.output).toBe(64000)
		expect(model.limit.context).toBe(200000)
		expect(model.capabilities.reasoning).toBe(true)
	})

	it("defaults adaptiveThinking to false when not present", async () => {
		const models = [make("claude-opus-4-5", ["/v1/messages"])]

		const server = Bun.serve({
			port: 0,
			fetch: async () => Response.json({ data: models }),
		})

		const fetchModels = await load()
		const url = `http://127.0.0.1:${server.port}`
		const res = await fetchModels({ sessionToken: "session", url, fetch })
		server.stop()

		expect(res.length).toBe(1)
		expect(res[0].options.adaptiveThinking).toBe(false)
	})
})
