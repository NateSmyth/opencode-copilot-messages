import type { Hooks, Plugin } from "@opencode-ai/plugin"
import type { Model } from "@opencode-ai/sdk"
import { authorizeDeviceCode, pollForToken } from "./auth/oauth"
import {
	ensureFreshToken,
	exchangeForSessionToken,
	getBaseUrlFromToken,
	refreshSessionToken,
} from "./auth/token"
import type { StoredAuth } from "./auth/types"
import { loadConfig } from "./config/schema"
import { fetchModels } from "./models/registry"
import { copilotMessagesFetch } from "./provider/fetch"

type ModelWithVariants = Model & { variants?: Record<string, unknown> }

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
export const CopilotMessagesPlugin: Plugin = async (input) => {
	const hooks = {
		config: async (config: { provider?: Record<string, unknown> }) => {
			if (!config.provider) {
				config.provider = {}
			}
			const providers = config.provider
			if (!providers["copilot-messages"]) {
				providers["copilot-messages"] = {
					npm: "@ai-sdk/anthropic",
					name: "Copilot Messages",
					models: {},
				}
			}
		},
		"chat.headers": async (
			data: {
				provider?: { info?: { id?: string } }
				message?: { metadata?: { parentSessionId?: string } }
			},
			output: { headers: Record<string, string> }
		) => {
			const id = data.provider?.info?.id
			if (id !== "copilot-messages") return
			const parent = data.message?.metadata?.parentSessionId
			if (!parent) return
			output.headers["x-initiator"] = "agent"
		},
		auth: {
			provider: "copilot-messages",
			methods: [
				{
					type: "oauth",
					label: "GitHub OAuth",
					authorize: async () => {
						const device = await authorizeDeviceCode()
						return {
							url: device.verification_uri,
							instructions: `Enter code: ${device.user_code}`,
							method: "auto",
							callback: async () => {
								const expiresAt = Math.floor(Date.now() / 1000) + device.expires_in
								const token = await pollForToken({
									deviceCode: device.device_code,
									interval: device.interval,
									expiresAt,
								})
								const session = await exchangeForSessionToken({
									githubToken: token.access_token,
								})
								return {
									type: "success",
									refresh: token.access_token,
									access: session.token,
									expires: session.expiresAt * 1000,
								}
							},
						}
					},
				},
			],
			loader: async (getAuth, provider) => {
				const config = await loadConfig()
				const stored = (await getAuth()) as StoredAuth | null
				if (!stored || stored.type !== "oauth") return {}
				let session = await refreshSessionToken({
					githubToken: stored.refresh,
					token: {
						token: stored.access,
						expiresAt: Math.floor(stored.expires / 1000),
						refreshIn: 0,
					},
				})
				const nextExpires = session.expiresAt * 1000
				if (session.token !== stored.access || nextExpires !== stored.expires) {
					await input.client.auth.set({
						path: { id: "copilot-messages" },
						body: {
							type: "oauth",
							refresh: stored.refresh,
							access: session.token,
							expires: nextExpires,
						},
					})
				}
				const target = provider as unknown as { models?: Record<string, ModelWithVariants> }
				const list = target.models ?? {}
				target.models = list
				const models = await fetchModels({
					sessionToken: session.token,
					betaFeatures: config.beta_features,
				})
				for (const model of models) {
					const existing = list[model.id]
					if (!existing) {
						list[model.id] = model
						continue
					}
					list[model.id] = mergeModel(model, existing)
				}
				const baseURL = getBaseUrlFromToken(session.token) ?? "https://api.githubcopilot.com"
				return {
					apiKey: "",
					baseURL: `${baseURL}/v1`,
					fetch: async (req: Request | string | URL, init?: RequestInit) => {
						const fresh = await ensureFreshToken({
							githubToken: stored.refresh,
							token: session,
						})

						if (fresh.token !== session.token) {
							session = fresh
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

						return copilotMessagesFetch(req, init, {
							sessionToken: session.token,
							betaFeatures: config.beta_features,
						})
					},
				}
			},
		},
	} as Hooks

	return hooks
}

function mergeModel(model: ModelWithVariants, existing: ModelWithVariants): ModelWithVariants {
	return {
		...model,
		limit: {
			...model.limit,
			...existing.limit,
		},
		options: {
			...model.options,
			...existing.options,
		},
		headers: {
			...model.headers,
			...existing.headers,
		},
		variants: {
			...model.variants,
			...existing.variants,
		},
	}
}
