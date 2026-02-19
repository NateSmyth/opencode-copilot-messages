import { describe, expect, it } from "bun:test"
import { determineInitiator, hasImageContent } from "./initiator"

describe("determineInitiator", () => {
	it("returns user when last input item is a user message with text", () => {
		const input = [
			{ role: "user", content: [{ type: "input_text", text: "hi" }] },
		]
		expect(determineInitiator(input)).toBe("user")
	})

	it("returns agent when last input item is function_call_output", () => {
		const input = [
			{ role: "user", content: [{ type: "input_text", text: "run it" }] },
			{ type: "function_call_output", call_id: "c1", output: "done" },
		]
		expect(determineInitiator(input)).toBe("agent")
	})

	it("returns agent for empty input array", () => {
		expect(determineInitiator([])).toBe("agent")
	})

	it("returns agent when user item has missing content", () => {
		const input = [{ role: "user" }]
		expect(determineInitiator(input)).toBe("agent")
	})

	it("returns agent when user item has empty content array", () => {
		const input = [{ role: "user", content: [] }]
		expect(determineInitiator(input)).toBe("agent")
	})
})

describe("hasImageContent", () => {
	it("returns true when any input item has input_image content", () => {
		const input = [
			{
				role: "user",
				content: [
					{ type: "input_text", text: "look at this" },
					{ type: "input_image", image_url: { url: "data:image/png;base64,AA==" } },
				],
			},
		]
		expect(hasImageContent(input)).toBe(true)
	})

	it("returns false when no input items contain images", () => {
		const input = [
			{ role: "user", content: [{ type: "input_text", text: "hello" }] },
		]
		expect(hasImageContent(input)).toBe(false)
	})

	it("returns false for empty input", () => {
		expect(hasImageContent([])).toBe(false)
	})

	it("returns false when input items have no content array", () => {
		const input = [
			{ type: "function_call_output", call_id: "c1", output: "done" },
		]
		expect(hasImageContent(input)).toBe(false)
	})
})
