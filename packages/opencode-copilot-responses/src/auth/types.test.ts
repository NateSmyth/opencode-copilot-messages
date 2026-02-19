import { describe, expect, it } from "bun:test"

async function load() {
	const mod = await import("./types")
	return mod
}

describe("StoredAuth", () => {
	it("accepts the expected shape with baseUrl", async () => {
		await load()

		const auth = {
			type: "oauth" as const,
			refresh: "gho_refresh",
			access: "gho_access",
			expires: 0,
			baseUrl: "https://api.individual.githubcopilot.com",
		}

		expect(auth.type).toBe("oauth")
		expect(auth.expires).toBe(0)
		expect(typeof auth.baseUrl).toBe("string")
		expect(typeof auth.refresh).toBe("string")
		expect(typeof auth.access).toBe("string")
	})
})
