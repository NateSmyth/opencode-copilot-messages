import type { Hooks, Plugin } from "@opencode-ai/plugin"
import type { Model } from "@opencode-ai/sdk"
import { authorizeDeviceCode, fetchEntitlement, pollForToken } from "./auth"
import type { StoredAuth } from "./auth/types"
import { fetchModels } from "./models/registry"
import { copilotResponsesFetch } from "./provider/fetch"

type ModelWithVariants = Model & { variants?: Record<string, unknown> }

export const CopilotResponsesPlugin: Plugin = async (input) => {
	const hooks = {
		config: async (config: { provider?: Record<string, unknown> }) => {
			if (!config.provider) config.provider = {}
			if (!config.provider["copilot-responses"]) {
				config.provider["copilot-responses"] = {
					npm: "@ai-sdk/openai",
					name: "Copilot Responses",
					models: {},
				}
			}
		},
		"chat.headers": async (
			data: { sessionID: string; model: { providerID: string } },
			output: { headers: Record<string, string> }
		) => {
			if (data.model.providerID !== "copilot-responses") return
			const session = await input.client.session
				.get({ path: { id: data.sessionID }, throwOnError: true })
				.catch(() => undefined)
			if (!session?.data?.parentID) return
			output.headers["x-initiator"] = "agent"
		},
		auth: {
			provider: "copilot-responses",
			methods: [
				{
					type: "oauth",
					label: "Login with GitHub (Copilot CLI)",
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
								const entitlement = await fetchEntitlement({
									token: token.access_token,
								})
								return {
									type: "success",
									refresh: token.access_token,
									access: token.access_token,
									expires: 0,
									baseUrl: entitlement.baseUrl,
								}
							},
						}
					},
				},
			],
			loader: async (getAuth, provider) => {
				const stored = (await getAuth()) as (StoredAuth & { baseUrl?: string }) | null
				if (!stored || stored.type !== "oauth") return {}
				const token =
					typeof stored.access === "string" && stored.access.startsWith("gho_")
						? stored.access
						: typeof stored.refresh === "string" && stored.refresh.startsWith("gho_")
							? stored.refresh
							: null
				if (!token) return {}

				const base = await resolveBaseUrl(stored, token, input)
				const models = await fetchModels({ token, baseUrl: base })
				const target = provider as unknown as {
					models?: Record<string, ModelWithVariants>
				}
				if (!target.models) target.models = {}
				for (const model of models) {
					const existing = target.models[model.id]
					if (!existing) {
						target.models[model.id] = model
						continue
					}
					target.models[model.id] = mergeModel(model, existing)
				}
				return {
					name: "openai",
					apiKey: "",
					baseURL: base,
					fetch: (req: Request | string | URL, init?: RequestInit) =>
						copilotResponsesFetch(req, init, { token }),
				}
			},
		},
	} as Hooks

	return hooks
}

async function resolveBaseUrl(
	stored: StoredAuth & { baseUrl?: string },
	token: string,
	input: Parameters<Plugin>[0]
): Promise<string> {
	if (typeof stored.baseUrl === "string" && stored.baseUrl.length > 0) return stored.baseUrl
	const entitlement = await fetchEntitlement({ token })
	await input.client.auth.set({
		path: { id: "copilot-responses" },
		body: { ...stored, baseUrl: entitlement.baseUrl } as never,
	})
	return entitlement.baseUrl
}

function mergeModel(model: ModelWithVariants, existing: ModelWithVariants): ModelWithVariants {
	return {
		...model,
		limit: { ...model.limit, ...existing.limit },
		options: { ...model.options, ...existing.options },
		headers: { ...model.headers, ...existing.headers },
		variants: { ...model.variants, ...existing.variants },
	}
}
