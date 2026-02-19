import type { Model } from "@opencode-ai/sdk"
import { MODELS_AGENT } from "../auth/headers"

export interface CopilotModel {
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

const RESPONSES_ENDPOINT = "/responses"

function parseModels(value: unknown): CopilotModel[] {
	if (Array.isArray(value)) return value
	if (!value || typeof value !== "object") return []
	const record = value as { data?: unknown; models?: unknown }
	if (Array.isArray(record.data)) return record.data
	if (Array.isArray(record.models)) return record.models
	return []
}

export function mapToOpencodeModel(model: CopilotModel, baseUrl: string): Model {
	const caps = model.capabilities ?? {}
	const limits = caps.limits ?? {}
	const supports = caps.supports ?? {}
	const vision = !!supports.vision
	const reasoning = supports.max_thinking_budget !== undefined

	return {
		id: model.id,
		providerID: "copilot-responses",
		name: model.name,
		api: {
			id: model.id,
			url: baseUrl,
			npm: "@ai-sdk/openai",
		},
		capabilities: {
			temperature: true,
			reasoning,
			attachment: vision,
			toolcall: !!supports.tool_calls,
			input: {
				text: true,
				audio: false,
				image: vision,
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
			context: limits.max_context_window_tokens ?? 200000,
			output: limits.max_output_tokens ?? 16000,
		},
		status: model.preview ? "beta" : "active",
		options: {},
		headers: {},
	}
}

export async function fetchModels(input: {
	token: string
	baseUrl: string
	fetch?: typeof fetch
}): Promise<Model[]> {
	const run = input.fetch ?? fetch
	const url = new URL("/models", input.baseUrl)
	const headers = {
		authorization: `Bearer ${input.token}`,
		"user-agent": MODELS_AGENT,
		"copilot-integration-id": "copilot-developer-cli",
		"x-github-api-version": "2025-05-01",
		"x-interaction-type": "model-access",
		"openai-intent": "model-access",
		"x-request-id": crypto.randomUUID(),
	}
	const res = await run(url, { method: "GET", headers })
	const data = (await res.json()) as unknown
	const models = parseModels(data)
	return models
		.filter(
			(m) =>
				Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes(RESPONSES_ENDPOINT)
		)
		.map((m) => mapToOpencodeModel(m, input.baseUrl))
}
