import type { Model } from "@opencode-ai/sdk"

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

export function mapToOpencodeModel(_model: CopilotModel, _baseUrl: string): Model {
	throw new Error("not implemented")
}

export async function fetchModels(_input: {
	token: string
	baseUrl: string
	fetch?: typeof fetch
}): Promise<Model[]> {
	throw new Error("not implemented")
}
