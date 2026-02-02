import { authorizeDeviceCode, pollForToken } from "./auth/oauth"
import { exchangeForSessionToken, refreshSessionToken } from "./auth/token"
import type { StoredAuth } from "./auth/types"
import { loadConfig } from "./config/schema"
import { fetchModels } from "./models/registry"
import { copilotMessagesFetch } from "./provider/fetch"

/**
 * OpenCode plugin for Copilot Claude via Anthropic Messages API.
 *
 * This plugin provides an alternate auth/routing path for Claude models
 * via Copilot's /v1/messages proxy endpoint (api.copilot.com/v1/messages).
 *
 * Key differences from standard Copilot:
 * - Uses client ID: Iv1.b507a08c87ecfe98
 * - Requires token exchange via /copilot_internal/v2/token
 * - Uses @ai-sdk/anthropic (Anthropic Messages API format)
 * - Critical: X-Initiator must check for tool_result content blocks
 */
export const CopilotMessagesPlugin = async (_input: unknown) => {
	const hooks = {
		config: async (input: { provider: Record<string, unknown> }) => {
			const providers = input.provider
			if (!providers["copilot-messages"]) {
				providers["copilot-messages"] = {
					npm: "@ai-sdk/anthropic",
					name: "Copilot Messages",
					models: {},
				}
			}
		},
		chat: {
			headers: async (input: {
				provider: { info: { id: string } }
				message?: { metadata?: { parentSessionId?: string } }
			}) => {
				const isCopilot = input.provider.info.id === "copilot-messages"
				if (!isCopilot) return
				const parent = input.message?.metadata?.parentSessionId
				if (!parent) return
				return { headers: { "x-initiator": "agent" } }
			},
		},
		auth: {
			provider: "copilot-messages",
			methods: [
				{
					name: "oauth",
					label: "GitHub OAuth",
					authorize: async () => {
						const device = await authorizeDeviceCode()
						const expiresAt = Math.floor(Date.now() / 1000) + device.expires_in
						const token = await pollForToken({
							deviceCode: device.device_code,
							interval: device.interval,
							expiresAt,
						})
						const session = await exchangeForSessionToken({ githubToken: token.access_token })
						return {
							type: "success",
							refresh: token.access_token,
							access: session.token,
							expires: session.expiresAt * 1000,
						}
					},
				},
			],
			loader: async (input: {
				auth: StoredAuth | null
				provider: { models: Record<string, unknown> }
				client: { auth: { set: (input: unknown) => Promise<unknown> } }
			}) => {
				const config = await loadConfig()
				const stored = input.auth
				if (!stored || stored.type !== "oauth") return {}
				const session = await refreshSessionToken({
					githubToken: stored.refresh,
					token: {
						token: stored.access,
						expiresAt: Math.floor(stored.expires / 1000),
						refreshIn: 0,
					},
				})
				if (session.token !== stored.access || session.expiresAt * 1000 !== stored.expires) {
					await input.client.auth.set({
						path: { id: "copilot-messages" },
						body: {
							type: "oauth",
							refresh: stored.refresh,
							access: session.token,
							expires: session.expiresAt * 1000,
						},
					})
				}
				const models = await fetchModels({
					sessionToken: session.token,
					betaFeatures: config.beta_features,
				})
				for (const model of models) {
					input.provider.models[model.id] = model
				}
				return {
					apiKey: "",
					baseURL: "https://api.copilot.com/v1",
					fetch: (req: Request | string | URL, init?: RequestInit) =>
						copilotMessagesFetch(req, init, {
							sessionToken: session.token,
							betaFeatures: config.beta_features,
						}),
				}
			},
		},
	}

	return hooks
}
