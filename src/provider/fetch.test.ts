import { describe, expect, it } from "bun:test"
import { copilotMessagesFetch } from "./fetch"

describe("copilotMessagesFetch", () => {
	it("strips x-api-key and injects copilot headers", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-api-key")).toBe(null)
				expect(req.headers.get("authorization")).toBe("Bearer session_test")
				expect(req.headers.get("x-interaction-type")).toBe("messages-proxy")
				expect(req.headers.get("openai-intent")).toBe("messages-proxy")
				const agent = req.headers.get("user-agent") ?? ""
				expect(agent.startsWith("GitHubCopilotChat/")).toBe(true)
				expect(req.headers.get("x-keep")).toBe("1")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-api-key": "k",
						"x-keep": "1",
					},
					body,
				},
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("derives x-initiator user from body messages", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("user")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("derives x-initiator agent when last block is tool_result", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "x" },
						{ type: "tool_result", content: [{ type: "text", text: "ok" }] },
					],
				},
			],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
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
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: { "content-type": "application/json", "x-initiator": "agent" },
					body,
				},
				{ sessionToken: "session_test" }
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
				expect(req.headers.get("Copilot-Vision-Request")).toBe("true")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			messages: [
				{
					role: "user",
					content: [
						{
							type: "image",
							source: {
								type: "base64",
								media_type: "image/png",
								data: "AA==",
							},
						},
					],
				},
			],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
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
				expect(req.headers.get("Copilot-Vision-Request")).toBe(null)
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("does not throw on invalid body and defaults initiator", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = "not-json"

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("forces agent initiator for title generator system prompt", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			system: "You are a title generator. Provide a short title.",
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("forces agent initiator for array-style title generator system prompt", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			system: [{ type: "text", text: "You are a title generator. Provide a short title." }],
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{ method: "POST", headers: { "content-type": "application/json" }, body },
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})
})
