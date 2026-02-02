import { describe, expect, it } from "bun:test"
import { loadConfig } from "./schema"

async function remove(path: string): Promise<void> {
	const file = Bun.file(path)
	const exists = await file.exists()
	if (!exists) return
	await Bun.spawn(["rm", "-f", path]).exited
}

async function write(path: string, data: unknown): Promise<void> {
	await Bun.spawn(["mkdir", "-p", `${Bun.env.HOME ?? ""}/.config/opencode`]).exited
	await Bun.write(path, JSON.stringify(data))
}

describe("loadConfig", () => {
	it("returns defaults when file missing", async () => {
		const path = `${Bun.env.HOME ?? ""}/.config/opencode/copilot-messages.json`
		await remove(path)
		const res = await loadConfig()
		expect(res).toEqual({ debug: false })
	})

	it("applies defaults when partial config provided", async () => {
		const path = `${Bun.env.HOME ?? ""}/.config/opencode/copilot-messages.json`
		await remove(path)
		await write(path, { beta_features: ["foo"] })
		const res = await loadConfig()
		expect(res).toEqual({ beta_features: ["foo"], debug: false })
		await remove(path)
	})

	it("rejects invalid ranges", async () => {
		const path = `${Bun.env.HOME ?? ""}/.config/opencode/copilot-messages.json`
		await remove(path)
		await write(path, { thinking_budget: 1 })
		const run = loadConfig()
		await expect(run).rejects.toThrow()
		await remove(path)
	})
})
