/**
 * Model registry for Copilot Messages API.
 *
 * Fetches available models from:
 * GET https://api.github.com/copilot_internal/v2/models
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

export interface CopilotModel {
  id: string;
  name: string;
  vendor: string;
  capabilities: {
    family: string;
    limits: {
      max_context_window_tokens: number;
      max_output_tokens: number;
      max_prompt_tokens: number;
    };
    supports: {
      max_thinking_budget?: number;
      min_thinking_budget?: number;
      streaming: boolean;
      tool_calls: boolean;
      vision: boolean;
    };
  };
  supported_endpoints: string[];
}

// TODO: Implement fetchModels()
// TODO: Implement mapToOpencodeModel()
