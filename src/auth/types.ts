/**
 * Auth types for Copilot Messages plugin.
 */

export interface CopilotMessagesAuth {
  // GitHub OAuth access token (PAT)
  githubToken: string;

  // Copilot session token (exchanged from PAT)
  sessionToken: string;

  // When session token expires (unix seconds)
  expiresAt: number;

  // When to refresh (seconds from issue)
  refreshIn: number;
}

export interface StoredAuth {
  type: "oauth";
  // Store the GitHub token as refresh, session token as access
  refresh: string;
  access: string;
  expires: number;
}
