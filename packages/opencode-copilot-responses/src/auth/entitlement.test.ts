import { describe, expect, it } from "bun:test"

type EntitlementResult = {
	baseUrl: string
	login: string
}

type EntitlementInput = {
	token: string
	fetch?: typeof fetch
	url?: string
}

async function load() {
	const mod = (await import("./entitlement")) as {
		fetchEntitlement?: (input: EntitlementInput) => Promise<EntitlementResult>
	}
	if (typeof mod.fetchEntitlement !== "function") throw new Error("fetchEntitlement missing")
	return mod.fetchEntitlement
}

describe("fetchEntitlement", () => {
	it("GETs /copilot_internal/user with bearer token and returns baseUrl + login", async () => {
		const server = Bun.serve({
			port: 0,
			async fetch(req) {
				expect(new URL(req.url).pathname).toBe("/copilot_internal/user")
				expect(req.method).toBe("GET")
				expect(req.headers.get("authorization")).toBe("Bearer gho_abc123")
				expect(req.headers.get("user-agent")).toBe("undici")
				expect(req.headers.get("accept")).toContain("application/json")
				return Response.json({
					login: "octocat",
					endpoints: {
						api: "https://api.individual.githubcopilot.com",
					},
				})
			},
		})

		try {
			const fetchEntitlement = await load()
			const res = await fetchEntitlement({
				token: "gho_abc123",
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			expect(res.baseUrl).toBe("https://api.individual.githubcopilot.com")
			expect(res.login).toBe("octocat")
		} finally {
			server.stop()
		}
	})

	it("throws on non-OK response including status", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => new Response("forbidden", { status: 403 }),
		})

		try {
			const fetchEntitlement = await load()
			const run = fetchEntitlement({
				token: "gho_bad",
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow(/403/)
		} finally {
			server.stop()
		}
	})

	it("throws when endpoints.api is missing", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => Response.json({ login: "octocat", endpoints: {} }),
		})

		try {
			const fetchEntitlement = await load()
			const run = fetchEntitlement({
				token: "gho_noapi",
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow()
		} finally {
			server.stop()
		}
	})

	it("throws when endpoints is missing entirely", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: () => Response.json({ login: "octocat" }),
		})

		try {
			const fetchEntitlement = await load()
			const run = fetchEntitlement({
				token: "gho_noendpoints",
				url: `http://127.0.0.1:${server.port}`,
				fetch,
			})
			await expect(run).rejects.toThrow()
		} finally {
			server.stop()
		}
	})
})
