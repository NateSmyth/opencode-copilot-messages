import { describe, expect, it } from "bun:test"
import type { Model } from "@opencode-ai/sdk"
import { MODELS_AGENT } from "../auth/headers"

type FetchInput = {
	token: string
	baseUrl: string
	fetch?: typeof fetch
}

type FetchModels = (input: FetchInput) => Promise<Model[]>
type MapFn = (model: CopilotModel, baseUrl: string) => Model

interface CopilotModel {
	id: string
	name: string
	vendor: string
	preview?: boolean
	capabilities?: {
		family?: string
		limits?: {
			max_context_window_tokens?: number
			max_output_tokens?: number
			max_prompt_tokens?: number
			vision?: {
				max_prompt_image_size?: number
				max_prompt_images?: number
				supported_media_types?: string[]
			}
		}
		supports?: {
			structured_outputs?: boolean
			max_thinking_budget?: number
			min_thinking_budget?: number
			streaming?: boolean
			tool_calls?: boolean
			vision?: boolean
			parallel_tool_calls?: boolean
		}
	}
	supported_endpoints?: string[]
}

async function load() {
	const registry = (await import("./registry")) as {
		fetchModels?: FetchModels
		mapToOpencodeModel?: MapFn
	}
	if (typeof registry.fetchModels !== "function") throw new Error("fetchModels not implemented")
	if (typeof registry.mapToOpencodeModel !== "function")
		throw new Error("mapToOpencodeModel not implemented")
	return {
		fetchModels: registry.fetchModels,
		map: registry.mapToOpencodeModel,
	}
}

const BASE_URL = "http://test.invalid"

const minimal = (id: string, endpoints: string[]): CopilotModel => ({
	id,
	name: id,
	vendor: "openai",
	capabilities: {
		limits: {
			max_context_window_tokens: 128000,
			max_output_tokens: 16384,
			max_prompt_tokens: 128000,
		},
		supports: {
			streaming: true,
			tool_calls: true,
			vision: false,
		},
	},
	supported_endpoints: endpoints,
})

function serve(handler: (req: Request) => Response | Promise<Response>) {
	const server = Bun.serve({ port: 0, fetch: handler })
	return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop() }
}

function serveModels(models: CopilotModel[]) {
	return serve(() => Response.json({ data: models }))
}

// Real-world fixture: gpt-5.3-codex from Copilot /models payload
const GPT53_FIXTURE: CopilotModel = {
	id: "gpt-5.3-codex",
	name: "GPT 5.3 Codex",
	vendor: "openai",
	preview: true,
	capabilities: {
		family: "gpt-5.3-codex",
		limits: {
			max_context_window_tokens: 1048576,
			max_output_tokens: 65536,
			max_prompt_tokens: 983040,
			vision: {
				max_prompt_image_size: 20971520,
				max_prompt_images: 20,
				supported_media_types: ["image/png", "image/jpeg", "image/gif", "image/webp"],
			},
		},
		supports: {
			structured_outputs: true,
			streaming: true,
			tool_calls: true,
			vision: true,
			parallel_tool_calls: true,
		},
	},
	supported_endpoints: ["/responses", "/chat/completions"],
}

describe("copilot responses model registry", () => {
	it("fetches /models with correct headers and filters to /responses models", async () => {
		const models = [
			minimal("gpt-chat-only", ["/chat/completions"]),
			minimal("gpt-responses-only", ["/responses"]),
			minimal("gpt-both", ["/responses", "/chat/completions"]),
		]

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const url = new URL(req.url)
				expect(url.pathname).toBe("/models")
				expect(req.method).toBe("GET")

				const auth = req.headers.get("authorization") ?? ""
				expect(auth.startsWith("Bearer ")).toBe(true)
				expect(req.headers.get("user-agent")).toBe(MODELS_AGENT)
				expect(req.headers.get("copilot-integration-id")).toBe("copilot-developer-cli")
				expect(req.headers.get("x-github-api-version")).toBe("2025-05-01")
				expect(req.headers.get("x-interaction-type")).toBe("model-access")
				expect(req.headers.get("openai-intent")).toBe("model-access")
				expect(req.headers.get("x-request-id")?.length).toBeGreaterThan(0)

				return Response.json({ data: models })
			},
		})

		const { fetchModels } = await load()
		const url = `http://127.0.0.1:${server.port}`
		const result = await fetchModels({ token: "test-token", baseUrl: url })
		server.stop()

		expect(result.length).toBe(2)
		const ids = result.map((m) => m.id)
		expect(ids).toContain("gpt-responses-only")
		expect(ids).toContain("gpt-both")
		expect(ids).not.toContain("gpt-chat-only")
	})

	it("parses all response envelope formats", async () => {
		const model = minimal("gpt-envelope", ["/responses"])
		const envelopes = [[model], { data: [model] }, { models: [model] }]
		const counter = { value: 0 }

		const server = Bun.serve({
			port: 0,
			fetch: async () => {
				const idx = counter.value
				counter.value += 1
				return Response.json(envelopes[idx] ?? [model])
			},
		})

		const { fetchModels } = await load()
		const url = `http://127.0.0.1:${server.port}`

		for (const _ of envelopes) {
			const result = await fetchModels({ token: "tok", baseUrl: url })
			expect(result.length).toBe(1)
			expect(result[0].id).toBe("gpt-envelope")
		}
		server.stop()
	})

	it("maps reasoning capability from max_thinking_budget", async () => {
		const reasoning: CopilotModel = {
			...minimal("gpt-reasoning", ["/responses"]),
			capabilities: {
				limits: { max_context_window_tokens: 128000, max_output_tokens: 16384 },
				supports: {
					max_thinking_budget: 32768,
					min_thinking_budget: 1024,
					streaming: true,
					tool_calls: true,
					vision: false,
				},
			},
		}

		const { url, stop } = serveModels([reasoning])
		const { fetchModels } = await load()
		const result = await fetchModels({ token: "tok", baseUrl: url })
		stop()

		expect(result.length).toBe(1)
		expect(result[0].capabilities.reasoning).toBe(true)
	})

	it("maps vision capability to attachment and input.image", async () => {
		const vision: CopilotModel = {
			...minimal("gpt-vision", ["/responses"]),
			capabilities: {
				limits: {
					max_context_window_tokens: 128000,
					max_output_tokens: 16384,
					vision: {
						max_prompt_image_size: 20971520,
						max_prompt_images: 20,
						supported_media_types: ["image/png", "image/jpeg"],
					},
				},
				supports: {
					streaming: true,
					tool_calls: true,
					vision: true,
				},
			},
		}

		const { url, stop } = serveModels([vision])
		const { fetchModels } = await load()
		const result = await fetchModels({ token: "tok", baseUrl: url })
		stop()

		expect(result.length).toBe(1)
		expect(result[0].capabilities.attachment).toBe(true)
		expect(result[0].capabilities.input.image).toBe(true)
	})

	it("sets correct invariants on all mapped models", async () => {
		const { url, stop } = serveModels([minimal("gpt-inv", ["/responses"])])
		const { fetchModels } = await load()
		const result = await fetchModels({ token: "tok", baseUrl: url })
		stop()

		const model = result[0]
		expect(model.providerID).toBe("copilot-responses")
		expect(model.api.npm).toBe("@ai-sdk/openai")
		expect(model.api.url).toBe(url)
		expect(model.cost).toEqual({
			input: 0,
			output: 0,
			cache: { read: 0, write: 0 },
		})
	})

	it("sets status beta for preview models, active otherwise", async () => {
		const { map } = await load()
		const preview = map({ ...minimal("prev", ["/responses"]), preview: true }, BASE_URL)
		const stable = map(minimal("stable", ["/responses"]), BASE_URL)

		expect(preview.status).toBe("beta")
		expect(stable.status).toBe("active")
	})

	it("produces full expected shape for gpt-5.3-codex fixture", async () => {
		const { map } = await load()
		const result = map(GPT53_FIXTURE, BASE_URL)

		const expected: Model = {
			id: "gpt-5.3-codex",
			providerID: "copilot-responses",
			name: "GPT 5.3 Codex",
			api: {
				id: "gpt-5.3-codex",
				url: BASE_URL,
				npm: "@ai-sdk/openai",
			},
			capabilities: {
				temperature: true,
				reasoning: false,
				attachment: true,
				toolcall: true,
				input: {
					text: true,
					audio: false,
					image: true,
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
				cache: { read: 0, write: 0 },
			},
			limit: {
				context: 1048576,
				output: 65536,
			},
			status: "beta",
			options: {},
			headers: {},
		}

		expect(result).toEqual(expected)
	})
})
