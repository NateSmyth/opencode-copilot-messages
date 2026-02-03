export const VSCODE_VERSION = "1.107.0"
export const COPILOT_CHAT_VERSION = "0.35.0"

export const COPILOT_HEADERS = {
	"User-Agent": `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
	"Editor-Version": `vscode/${VSCODE_VERSION}`,
	"Editor-Plugin-Version": `copilot-chat/${COPILOT_CHAT_VERSION}`,
	"Copilot-Integration-Id": "vscode-chat",
} as const
