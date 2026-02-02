import { describe, expect, it } from "bun:test"
import type { CopilotModel } from "./registry"

type OpenModel = {
	id: string
	name: string
	providerID: string
	api: { npm: string }
	cost: { input: number; output: number }
	limit: { context: number; output: number }
	options: { maxThinkingBudget?: number; minThinkingBudget?: number }
}

type FetchInput = {
	sessionToken: string
	fetch?: typeof fetch
	url?: string
	betaFeatures?: string[]
}

type FetchModels = (input: FetchInput) => Promise<OpenModel[]>

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
			name: "claude-messages",
			providerID: "copilot-messages",
			api: { npm: "@ai-sdk/anthropic" },
			cost: { input: 0, output: 0 },
			limit: {
				context: 120000,
				output: 4096,
			},
			options: {
				maxThinkingBudget: 1024,
				minThinkingBudget: 128,
			},
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
})
