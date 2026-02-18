export const VSCODE_VERSION = "1.108.2"
export const COPILOT_CHAT_VERSION = "0.36.2"

export const COPILOT_HEADERS = {
	"User-Agent": `GitHubCopilotChat/${COPILOT_CHAT_VERSION}`,
	"Editor-Version": `vscode/${VSCODE_VERSION}`,
	"Editor-Plugin-Version": `copilot-chat/${COPILOT_CHAT_VERSION}`,
	"Copilot-Integration-Id": "vscode-chat",
} as const
