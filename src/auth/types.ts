/**
 * Auth types for Copilot Messages plugin.
 */

export interface StoredAuth {
	type: "oauth"
	// Store the GitHub token as refresh, session token as access
	refresh: string
	access: string
	expires: number
}
