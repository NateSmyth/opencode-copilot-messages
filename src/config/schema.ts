import { z } from "zod";

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
});

export type CopilotMessagesConfig = z.infer<typeof configSchema>;

// TODO: Implement loadConfig()
