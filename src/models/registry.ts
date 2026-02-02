/**
 * Model registry for Copilot Messages API.
 *
 * Fetches available models from:
 * GET https://api.copilot.com/models
 *
 * Filters to models with supported_endpoints including "/v1/messages"
 *
 * Available Claude 4.x models:
 * - claude-4.5-opus
 * - claude-4.5-sonnet
 * - claude-4.5-haiku
 * - claude-4-sonnet
 * - claude-4.1-opus
 */

import { buildHeaders } from "../provider/headers"

export interface CopilotModel {
	id: string
	name: string
	vendor: string
	capabilities: {
		family: string
		limits: {
			max_context_window_tokens: number
			max_output_tokens: number
			max_prompt_tokens: number
		}
		supports: {
			max_thinking_budget?: number
			min_thinking_budget?: number
			streaming: boolean
			tool_calls: boolean
			vision: boolean
		}
	}
	supported_endpoints: string[]
}

export type OpencodeModel = {
	id: string
	name: string
	providerID: "copilot-messages"
	api: { npm: "@ai-sdk/anthropic" }
	cost: { input: 0; output: 0 }
	limit: {
		context: number
		output: number
	}
	options: {
		maxThinkingBudget?: number
		minThinkingBudget?: number
	}
}

export function mapToOpencodeModel(model: CopilotModel): OpencodeModel {
	return {
		id: model.id,
		name: model.name,
		providerID: "copilot-messages",
		api: { npm: "@ai-sdk/anthropic" },
		cost: { input: 0, output: 0 },
		limit: {
			context: model.capabilities.limits.max_context_window_tokens,
			output: model.capabilities.limits.max_output_tokens,
		},
		options: {
			maxThinkingBudget: model.capabilities.supports.max_thinking_budget,
			minThinkingBudget: model.capabilities.supports.min_thinking_budget,
		},
	}
}

type FetchInput = {
	sessionToken: string
	fetch?: typeof fetch
	url?: string
	betaFeatures?: string[]
}

const MESSAGES_ENDPOINT = "/v1/messages"

function parseModels(value: unknown): CopilotModel[] {
	if (Array.isArray(value)) return value
	if (!value || typeof value !== "object") return []
	const record = value as { data?: unknown; models?: unknown }
	if (Array.isArray(record.data)) return record.data
	if (Array.isArray(record.models)) return record.models
	return []
}

export async function fetchModels(input: FetchInput): Promise<OpencodeModel[]> {
	const run = input.fetch ?? fetch
	const url = new URL("/models", input.url ?? "https://api.copilot.com")
	const headers = buildHeaders({
		sessionToken: input.sessionToken,
		initiator: "agent",
		betaFeatures: input.betaFeatures,
		interaction: "model-access",
		intent: "model-access",
	})
	const res = await run(url, { method: "GET", headers })
	const data = (await res.json()) as unknown
	const models = parseModels(data)
	return models
		.filter((model) => model.supported_endpoints.includes(MESSAGES_ENDPOINT))
		.map(mapToOpencodeModel)
}
