import { describe, expect, it } from "bun:test"
import { copilotResponsesFetch } from "./fetch"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe("copilotResponsesFetch", () => {
	it("strips x-api-key and injects copilot headers", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-api-key")).toBe(null)
				expect(req.headers.get("authorization")).toBe("Bearer gho_test")
				expect(req.headers.get("copilot-integration-id")).toBe("copilot-developer-cli")
				expect(req.headers.get("x-github-api-version")).toBe("2025-05-01")
				expect(req.headers.get("x-interaction-type")).toBe("conversation-agent")
				expect(req.headers.get("openai-intent")).toBe("conversation-agent")
				expect(req.headers.get("x-interaction-id")).toMatch(UUID)
				expect(req.headers.get("x-request-id")).toMatch(UUID)
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-api-key": "sk-test",
					},
					body: JSON.stringify({ input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }] }),
				},
				{ token: "gho_test" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("generates unique UUIDs per request", async () => {
		const ids: string[] = []
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				ids.push(req.headers.get("x-request-id")!)
				return new Response("ok")
			},
		})

		try {
			const url = `http://127.0.0.1:${server.port}`
			const init = { method: "POST", body: JSON.stringify({ input: [] }) }
			await copilotResponsesFetch(url, init, { token: "t" })
			await copilotResponsesFetch(url, init, { token: "t" })
			expect(ids[0]).not.toBe(ids[1])
		} finally {
			server.stop()
		}
	})

	it("preserves non-conflicting caller headers", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-keep")).toBe("1")
				expect(req.headers.get("content-type")).toBe("application/json")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json", "x-keep": "1" },
					body: JSON.stringify({ input: [] }),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("derives x-initiator user from user text input", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("user")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("derives x-initiator agent from function_call_output", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input: [
							{ role: "user", content: [{ type: "input_text", text: "run" }] },
							{ type: "function_call_output", call_id: "c1", output: "done" },
						],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("keeps caller-supplied x-initiator", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json", "x-initiator": "agent" },
					body: JSON.stringify({
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("sets Copilot-Vision-Request when images are present", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("copilot-vision-request")).toBe("true")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input: [{
							role: "user",
							content: [{ type: "input_image", image_url: { url: "data:image/png;base64,AA==" } }],
						}],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("omits Copilot-Vision-Request when images are absent", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("copilot-vision-request")).toBe(null)
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("forces agent initiator for title generator instructions (string)", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						instructions: "You are a title generator. Provide a short title.",
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("forces agent initiator for title generator instructions (array)", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						instructions: [{ type: "text", text: "You are a title generator. Provide a short title." }],
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("forces agent initiator for system field fallback", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						system: "You are a title generator. Provide a short title.",
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("does not throw on malformed body and defaults initiator to agent", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				expect(req.headers.get("copilot-vision-request")).toBe(null)
				return new Response("ok")
			},
		})

		try {
			const res = await copilotResponsesFetch(
				`http://127.0.0.1:${server.port}`,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body: "not-json",
				},
				{ token: "t" },
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})
})
