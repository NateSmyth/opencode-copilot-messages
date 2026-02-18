import { describe, expect, it } from "bun:test"
import { CopilotResponsesPlugin } from "./plugin"

describe("CopilotResponsesPlugin", () => {
	it("exports a plugin function", () => {
		expect(typeof CopilotResponsesPlugin).toBe("function")
	})
})
