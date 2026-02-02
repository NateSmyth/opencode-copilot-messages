import { z } from "zod"

/**
 * Configuration schema for Copilot Messages plugin.
 *
 * Config file location: ~/.config/opencode/copilot-messages.json
 */
export const configSchema = z.object({
	// Thinking budget override (uses model default if not set)
	// Min: 1024, Max: 32000
	thinking_budget: z.number().min(1024).max(32000).optional(),

	// Additional anthropic-beta features to enable
	beta_features: z.array(z.string()).optional(),

	// Debug logging
	debug: z.boolean().default(false),
})

export type CopilotMessagesConfig = z.infer<typeof configSchema>

const CONFIG_PATH = `${Bun.env.HOME ?? ""}/.config/opencode/copilot-messages.json`

export async function loadConfig(): Promise<CopilotMessagesConfig> {
	const file = Bun.file(CONFIG_PATH)
	const exists = await file.exists()
	const data = await (async () => {
		if (!exists) return {}
		const text = await file.text()
		if (!text.trim()) return {}
		return JSON.parse(text) as unknown
	})()
	return configSchema.parse(data)
}
