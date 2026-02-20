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

async function withServer(
	handler: (req: Request) => Response | Promise<Response>,
	run: (url: string) => Promise<void>
) {
	const server = Bun.serve({ port: 0, fetch: handler })
	try {
		await run(`http://127.0.0.1:${server.port}`)
	} finally {
		server.stop()
	}
}

describe("fetchEntitlement", () => {
	it("GETs /copilot_internal/user with bearer token and returns baseUrl + login", async () => {
		await withServer(
			async (req) => {
				expect(new URL(req.url).pathname).toBe("/copilot_internal/user")
				expect(req.method).toBe("GET")
				expect(req.headers.get("authorization")).toBe("Bearer gho_abc123")
				expect(req.headers.get("user-agent")).toBeTruthy()
				expect(req.headers.get("accept")).toContain("application/json")
				return Response.json({
					login: "octocat",
					endpoints: {
						api: "https://api.individual.githubcopilot.com",
					},
				})
			},
			async (url) => {
				const fetchEntitlement = await load()
				const res = await fetchEntitlement({ token: "gho_abc123", url, fetch })
				expect(res.baseUrl).toBe("https://api.individual.githubcopilot.com")
				expect(res.login).toBe("octocat")
			}
		)
	})

	it("throws on non-OK response including status", async () => {
		await withServer(
			() => new Response("forbidden", { status: 403 }),
			async (url) => {
				const fetchEntitlement = await load()
				const run = fetchEntitlement({ token: "gho_bad", url, fetch })
				await expect(run).rejects.toThrow(/403/)
			}
		)
	})

	it("throws when endpoints.api is missing", async () => {
		await withServer(
			() => Response.json({ login: "octocat", endpoints: {} }),
			async (url) => {
				const fetchEntitlement = await load()
				const run = fetchEntitlement({ token: "gho_noapi", url, fetch })
				await expect(run).rejects.toThrow()
			}
		)
	})

	it("throws when endpoints is missing entirely", async () => {
		await withServer(
			() => Response.json({ login: "octocat" }),
			async (url) => {
				const fetchEntitlement = await load()
				const run = fetchEntitlement({ token: "gho_noendpoints", url, fetch })
				await expect(run).rejects.toThrow()
			}
		)
	})
})
