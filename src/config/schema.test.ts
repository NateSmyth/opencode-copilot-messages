import { afterEach, beforeEach, describe, expect, it } from "bun:test"
import { loadConfig } from "./schema"

const path = `${Bun.env.HOME ?? ""}/.config/opencode/copilot-messages.json`
const dir = `${Bun.env.HOME ?? ""}/.config/opencode`

async function remove(): Promise<void> {
	await Bun.spawn(["rm", "-f", path]).exited
}

async function prepare(): Promise<void> {
	await Bun.spawn(["mkdir", "-p", dir]).exited
}

async function save(data: unknown): Promise<void> {
	await prepare()
	await Bun.write(path, JSON.stringify(data))
}

async function raw(text: string): Promise<void> {
	await prepare()
	await Bun.write(path, text)
}

describe("loadConfig", () => {
	beforeEach(async () => {
		await remove()
	})

	afterEach(async () => {
		await remove()
	})

	it("returns defaults when file missing", async () => {
		const res = await loadConfig()
		expect(res).toEqual({ debug: false })
	})

	it("returns defaults when file empty", async () => {
		await raw("\n\t  ")
		const res = await loadConfig()
		expect(res).toEqual({ debug: false })
	})

	it("applies defaults when partial config provided", async () => {
		await save({ beta_features: ["foo"] })
		const res = await loadConfig()
		expect(res).toEqual({ beta_features: ["foo"], debug: false })
	})

	it("accepts thinking_budget boundaries", async () => {
		await save({ thinking_budget: 1024 })
		const min = await loadConfig()
		expect(min).toEqual({ thinking_budget: 1024, debug: false })

		await save({ thinking_budget: 32000 })
		const max = await loadConfig()
		expect(max).toEqual({ thinking_budget: 32000, debug: false })
	})

	it("rejects thinking_budget outside boundaries", async () => {
		await save({ thinking_budget: 1023 })
		await expect(loadConfig()).rejects.toThrow()

		await save({ thinking_budget: 32001 })
		await expect(loadConfig()).rejects.toThrow()
	})

	it("rejects malformed JSON", async () => {
		await raw("{not-json")
		await expect(loadConfig()).rejects.toThrow()
	})
})
