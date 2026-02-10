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
import { fetchModels } from "./models/registry"
import { copilotMessagesFetch, EFFORTS } from "./provider/fetch"
import { put } from "./provider/stash"

type ModelWithVariants = Model & { variants?: Record<string, unknown> }

export const CopilotMessagesPlugin: Plugin = async (input) => {
	const pending = new Map<string, { effort?: string; stash?: string }>()
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
		"chat.params": async (
			data: {
				sessionID: string
				model: { providerID: string; options?: Record<string, unknown> }
				message?: { variant?: string }
			},
			output: { options: Record<string, unknown> }
		) => {
			if (data.model.providerID !== "copilot-messages") return
			if (data.model.options?.adaptiveThinking !== true) return

			const thinking = output.options.thinking as { type?: string } | undefined
			const explicit = output.options.effort as string | undefined
			const variant = data.message?.variant

			const adaptive = typeof thinking === "object" && thinking?.type === "adaptive"
			const max = explicit === "max"

			if (adaptive || max) {
				const token = crypto.randomUUID()
				const stashed: { thinking?: unknown; effort?: unknown } = {}
				if (adaptive) stashed.thinking = structuredClone(thinking)
				if (max) stashed.effort = explicit
				put(token, stashed)

				output.options.thinking = { type: "enabled", budgetTokens: 1024 }
				if (max) delete output.options.effort

				const entry = pending.get(data.sessionID) ?? {}
				entry.stash = token
				pending.set(data.sessionID, entry)
			}

			// Variant remap: resolve effort from explicit option or variant name
			const resolved = EFFORTS.has(explicit ?? "")
				? (explicit as string)
				: EFFORTS.has(variant ?? "")
					? (variant as string)
					: undefined
			if (resolved && !(resolved === "max" && max)) {
				const entry = pending.get(data.sessionID) ?? {}
				entry.effort = resolved
				pending.set(data.sessionID, entry)
			}
		},
		"chat.headers": async (
			data: {
				sessionID: string
				model: { providerID: string }
				provider?: { info?: { id?: string } }
			},
			output: { headers: Record<string, string> }
		) => {
			const providerID = data.model.providerID
			if (providerID !== "copilot-messages") return

			const entry = pending.get(data.sessionID)
			if (entry) {
				pending.delete(data.sessionID)
				if (entry.effort) output.headers["x-adaptive-effort"] = entry.effort
				if (entry.stash) output.headers["x-adaptive-stash"] = entry.stash
			}

			const session = await input.client.session
				.get({
					path: {
						id: data.sessionID,
					},
					throwOnError: true,
				})
				.catch(() => undefined)
			if (!session?.data?.parentID) return
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
				const target = provider as unknown as {
					models?: Record<string, ModelWithVariants>
				}
				const list = target.models ?? {}
				target.models = list
				const models = await fetchModels({
					sessionToken: session.token,
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
