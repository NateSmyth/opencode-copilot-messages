export const COPILOT_CLI_VERSION = "0.0.411"

const term = process.env.TERM_PROGRAM ?? "xterm-256color"

export const MODELS_AGENT = `copilot/${COPILOT_CLI_VERSION} (${process.platform} ${process.version}) term/${term}`
export const RESPONSES_AGENT = `copilot/${COPILOT_CLI_VERSION} (client/cli ${process.platform} ${process.version}) term/${term}`
export const AUTH_AGENT = "undici"
