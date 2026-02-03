import { COPILOT_HEADERS } from "../provider/headers"

export const CLIENT_ID = "Iv1.b507a08c87ecfe98"

export interface DeviceCodeResponse {
	device_code: string
	user_code: string
	verification_uri: string
	expires_in: number
	interval: number
}

export interface TokenResponse {
	access_token: string
	token_type: string
	scope: string
}

export async function authorizeDeviceCode(input?: {
	fetch?: typeof fetch
	url?: string
	clientId?: string
	scope?: string
}): Promise<DeviceCodeResponse> {
	const base = input?.url ?? "https://github.com"
	const clientId = input?.clientId ?? CLIENT_ID
	const scope = input?.scope ?? "read:user"
	const run = input?.fetch ?? fetch
	const endpoint = new URL("/login/device/code", base)
	const res = await run(endpoint, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/json",
			...COPILOT_HEADERS,
		},
		body: JSON.stringify({
			client_id: clientId,
			scope,
		}),
	})

	if (!res.ok) {
		throw new Error(`device code request failed (${res.status}) ${endpoint.pathname}`)
	}

	return (await res.json()) as DeviceCodeResponse
}

export async function pollForToken(input: {
	deviceCode: string
	interval: number
	expiresAt: number
	fetch?: typeof fetch
	url?: string
	clientId?: string
	sleep?: (ms: number) => Promise<void>
	now?: () => number
}): Promise<TokenResponse> {
	const base = input.url ?? "https://github.com"
	const clientId = input.clientId ?? CLIENT_ID
	const run = input.fetch ?? fetch
	const sleep =
		input.sleep ??
		(async (ms: number) => {
			await new Promise((resolve) => setTimeout(resolve, ms))
		})
	const now = input.now ?? (() => Date.now())
	const endpoint = new URL("/login/oauth/access_token", base)

	const step = async (interval: number): Promise<TokenResponse> => {
		const nowSeconds = Math.floor(now() / 1000)
		if (nowSeconds >= input.expiresAt) {
			throw new Error("expired_token")
		}

		const res = await run(endpoint, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/json",
				...COPILOT_HEADERS,
			},
			body: JSON.stringify({
				client_id: clientId,
				device_code: input.deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		})
		const data = (await res.json()) as
			| TokenResponse
			| {
					error: string
					error_description?: string
					interval?: number
			  }

		if ("access_token" in data) {
			return data
		}

		if (data.error === "authorization_pending") {
			await sleep(interval * 1000)
			return step(interval)
		}

		if (data.error === "slow_down") {
			const next = data.interval ?? interval + 5
			await sleep(next * 1000)
			return step(next)
		}

		if (data.error === "expired_token") {
			throw new Error("expired_token")
		}

		if (data.error === "access_denied") {
			throw new Error("access_denied")
		}

		const detail = data.error_description ? ` ${data.error_description}` : ""
		throw new Error(`${data.error}${detail}`)
	}

	return step(input.interval)
}
