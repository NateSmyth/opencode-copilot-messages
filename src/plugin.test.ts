import { describe, expect, it } from "bun:test"
import { CopilotMessagesPlugin } from "./plugin"

describe("CopilotMessagesPlugin hooks", () => {
	it("registers provider and sets initiator for subagents", async () => {
		const hooks = (await CopilotMessagesPlugin({} as never)) as unknown as {
			config?: (input: unknown) => Promise<{ config?: { provider?: Record<string, unknown> } }>
			chat?: { headers?: (input: unknown) => Promise<{ headers?: Record<string, string> }> }
		}
		if (!hooks.config || !hooks.chat?.headers) {
			throw new Error("hooks missing config or chat.headers")
		}

		const configInput = { provider: {} as Record<string, unknown> }
		await hooks.config(configInput as never)
		const provider = configInput.provider as Record<string, unknown>
		expect(provider["copilot-messages"]).toEqual({
			npm: "@ai-sdk/anthropic",
			name: "Copilot Messages",
			models: {},
		})

		const headersInput = {
			provider: { info: { id: "copilot-messages" } },
			message: { metadata: { parentSessionId: "parent" } },
		}
		const headersRes = await hooks.chat.headers(headersInput as never)
		expect(headersRes?.headers?.["x-initiator"]).toBe("agent")

		const otherRes = await hooks.chat.headers({
			provider: { info: { id: "other" } },
			message: { metadata: { parentSessionId: "parent" } },
		} as never)
		expect(otherRes?.headers?.["x-initiator"]).toBe(undefined)

		const userRes = await hooks.chat.headers({
			provider: { info: { id: "copilot-messages" } },
			message: { metadata: {} },
		} as never)
		expect(userRes?.headers?.["x-initiator"]).toBe(undefined)
	})
})
