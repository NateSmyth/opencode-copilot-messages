import type { Model } from "@opencode-ai/sdk"
import { COPILOT_CHAT_VERSION, VSCODE_VERSION } from "../auth/headers"
import { getBaseUrlFromToken } from "../auth/token"

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
			adaptive_thinking?: boolean
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

export function mapToOpencodeModel(model: CopilotModel): Model {
	const caps = model.capabilities ?? {}
	const limits = caps.limits ?? {}
	const supports = caps.supports ?? {}
	const vision = !!supports.vision
	const reasoning = supports.max_thinking_budget !== undefined

	return {
		id: model.id,
		providerID: "copilot-messages",
		name: model.name,
		api: {
			id: model.id,
			url: "https://api.githubcopilot.com/v1",
			npm: "@ai-sdk/anthropic",
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
		options: {
			adaptiveThinking: !!supports.adaptive_thinking,
			maxThinkingBudget: supports.max_thinking_budget,
			minThinkingBudget: supports.min_thinking_budget,
		},
		headers: {},
	}
}

type FetchInput = {
	sessionToken: string
	fetch?: typeof fetch
	url?: string
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

export async function fetchModels(input: FetchInput): Promise<Model[]> {
	const run = input.fetch ?? fetch
	const base =
		input.url ?? getBaseUrlFromToken(input.sessionToken) ?? "https://api.githubcopilot.com"
	const url = new URL("/models", base)
	const headers = {
		authorization: `Bearer ${input.sessionToken}`,
		"user-agent": `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
		"editor-version": `vscode/${VSCODE_VERSION}`,
		"editor-plugin-version": `copilot-chat/${COPILOT_CHAT_VERSION}`,
		"copilot-integration-id": "vscode-chat",
		"x-request-id": crypto.randomUUID(),
		"x-github-api-version": "2025-10-01",
		"x-interaction-type": "model-access",
		"openai-intent": "model-access",
	}
	const res = await run(url, { method: "GET", headers })
	const data = (await res.json()) as unknown
	const models = parseModels(data)
	return models
		.filter(
			(model) =>
				Array.isArray(model.supported_endpoints) &&
				model.supported_endpoints.includes(MESSAGES_ENDPOINT)
		)
		.map(mapToOpencodeModel)
}
