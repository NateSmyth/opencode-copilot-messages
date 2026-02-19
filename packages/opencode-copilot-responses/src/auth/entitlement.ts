export async function fetchEntitlement(input: {
	token: string
	fetch?: typeof fetch
	url?: string
}) {
	const base = input.url ?? "https://api.github.com"
	const run = input.fetch ?? fetch
	const endpoint = new URL("/copilot_internal/user", base)

	const res = await run(endpoint, {
		headers: {
			Authorization: `Bearer ${input.token}`,
			Accept: "application/json",
		},
	})

	if (!res.ok) {
		throw new Error(`entitlement check failed (${res.status}) ${endpoint.pathname}`)
	}

	const data = (await res.json()) as Record<string, unknown>
	const endpoints = data.endpoints as Record<string, unknown> | undefined
	const api = endpoints?.api

	if (typeof api !== "string" || api.length === 0) {
		throw new Error("entitlement response missing endpoints.api")
	}

	return { baseUrl: api, login: data.login as string }
}
