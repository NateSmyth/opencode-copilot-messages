import { describe, expect, it } from "bun:test"
import type { StoredAuth } from "./types"

describe("StoredAuth", () => {
	it("enforces the persisted auth shape", () => {
		// Explicit annotation: compilation fails if StoredAuth shape drifts
		const auth: StoredAuth = {
			type: "oauth",
			refresh: "gho_refresh",
			access: "gho_access",
			expires: 0,
			baseUrl: "https://api.individual.githubcopilot.com",
		}
		// Stored types must survive serialization
		expect(JSON.parse(JSON.stringify(auth))).toEqual(auth)
	})
})
