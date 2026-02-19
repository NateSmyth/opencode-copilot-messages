export const CLIENT_ID = "Ov23ctDVkRmgkPke0Mmm"

export async function authorizeDeviceCode(input?: {
	fetch?: typeof fetch
	url?: string
	clientId?: string
	scope?: string
}) {
	const base = input?.url ?? "https://github.com"
	const id = input?.clientId ?? CLIENT_ID
	const scope = input?.scope ?? "read:user"
	const run = input?.fetch ?? fetch
	const endpoint = new URL("/login/device/code", base)

	const res = await run(endpoint, {
		method: "POST",
		headers: {
			Accept: "application/json",
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({ client_id: id, scope }).toString(),
	})

	if (!res.ok) {
		throw new Error(`device code request failed (${res.status}) ${endpoint.pathname}`)
	}

	return (await res.json()) as {
		device_code: string
		user_code: string
		verification_uri: string
		expires_in: number
		interval: number
	}
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
}) {
	const base = input.url ?? "https://github.com"
	const id = input.clientId ?? CLIENT_ID
	const run = input.fetch ?? fetch
	const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
	const now = input.now ?? (() => Date.now())
	const endpoint = new URL("/login/oauth/access_token", base)

	const step = async (
		interval: number
	): Promise<{
		access_token: string
		token_type: string
		scope: string
	}> => {
		if (Math.floor(now() / 1000) >= input.expiresAt) {
			throw new Error("expired_token")
		}

		const res = await run(endpoint, {
			method: "POST",
			headers: {
				Accept: "application/json",
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: id,
				device_code: input.deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}).toString(),
		})

		const data = (await res.json()) as Record<string, unknown>

		if ("access_token" in data) {
			return data as { access_token: string; token_type: string; scope: string }
		}

		if (data.error === "authorization_pending") {
			await sleep(interval * 1000)
			return step(interval)
		}

		if (data.error === "slow_down") {
			const next = typeof data.interval === "number" ? data.interval : interval + 5
			await sleep(next * 1000)
			return step(next)
		}

		if (data.error === "expired_token") throw new Error("expired_token")
		if (data.error === "access_denied") throw new Error("access_denied")

		const detail = data.error_description ? ` ${data.error_description}` : ""
		throw new Error(`${data.error}${detail}`)
	}

	return step(input.interval)
}
