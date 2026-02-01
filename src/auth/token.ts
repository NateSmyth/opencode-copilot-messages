/**
 * Session token exchange and refresh for Copilot Messages API.
 *
 * Exchange GitHub PAT for Copilot session token:
 *
 * POST https://api.github.com/copilot_internal/v2/token
 * Headers:
 *   Authorization: token ${githubToken}  // NOTE: "token" not "Bearer"
 *   X-GitHub-Api-Version: 2025-04-01
 *
 * Response: { token, expires_at, refresh_in }
 * Token format: "tid=...;exp=...:mac" (HMAC-signed structured string)
 *
 * Refresh logic: If expires_at < nowSeconds() + 300 (5 min buffer), refresh.
 */

export interface TokenEnvelope {
  token: string;
  expires_at: number;
  refresh_in: number;
}

export interface SessionToken {
  token: string;
  expiresAt: number;
  refreshIn: number;
}

// TODO: Implement exchangeForSessionToken()
// TODO: Implement refreshSessionToken()
// TODO: Implement parseTokenFields() for structured token parsing
