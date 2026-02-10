import { describe, expect, it } from "bun:test"
import { copilotMessagesFetch } from "./fetch"
import { put } from "./stash"

describe("copilotMessagesFetch", () => {
	it("strips x-api-key and injects copilot headers", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				expect(req.headers.get("x-api-key")).toBe(null)
				expect(req.headers.get("authorization")).toBe("Bearer session_test")
				expect(req.headers.get("x-interaction-type")).toBe("messages-proxy")
				expect(req.headers.get("openai-intent")).toBe("messages-proxy")
				expect(req.headers.get("anthropic-beta")).toBe("interleaved-thinking-2025-05-14")
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
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
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
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
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
					headers: {
						"content-type": "application/json",
						"x-initiator": "agent",
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
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
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
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
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
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
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
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
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
			system: [
				{
					type: "text",
					text: "You are a title generator. Provide a short title.",
				},
			],
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("rewrites thinking to adaptive when x-adaptive-effort is set", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				const thinking = sent.thinking as Record<string, unknown>
				expect(thinking.type).toBe("adaptive")
				expect(thinking.budget_tokens).toBeUndefined()
				const config = sent.output_config as Record<string, unknown>
				expect(config.effort).toBe("high")
				expect(sent.max_tokens).toBe(32000)
				expect(req.headers.get("x-adaptive-effort")).toBe(null)
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			thinking: { type: "enabled", budget_tokens: 16000 },
			max_tokens: 32000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-adaptive-effort": "high",
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

	it("rewrites thinking with effort max when x-adaptive-effort is max", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				const thinking = sent.thinking as Record<string, unknown>
				expect(thinking.type).toBe("adaptive")
				const config = sent.output_config as Record<string, unknown>
				expect(config.effort).toBe("max")
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			thinking: { type: "enabled", budget_tokens: 31999 },
			max_tokens: 48000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-adaptive-effort": "max",
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

	it("does not rewrite body when x-adaptive-effort is absent", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				const thinking = sent.thinking as Record<string, unknown>
				expect(thinking.type).toBe("enabled")
				expect(thinking.budget_tokens).toBe(16000)
				expect(sent.output_config).toBeUndefined()
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			thinking: { type: "enabled", budget_tokens: 16000 },
			max_tokens: 32000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: { "content-type": "application/json" },
					body,
				},
				{ sessionToken: "session_test" }
			)
			expect(res.ok).toBe(true)
		} finally {
			server.stop()
		}
	})

	it("does not rewrite when thinking is not enabled", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				expect(sent.thinking).toBeUndefined()
				expect(sent.output_config).toBeUndefined()
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			max_tokens: 16000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-adaptive-effort": "high",
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

	it("replaces output_config during effort rewrite (full swap, no merge)", async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				const config = sent.output_config as Record<string, unknown>
				expect(config.effort).toBe("high")
				// full swap: pre-existing fields are NOT preserved
				expect(config.format).toBeUndefined()
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			thinking: { type: "enabled", budget_tokens: 16000 },
			output_config: { format: "json" },
			max_tokens: 32000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-adaptive-effort": "high",
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

	it("rewrites body from stash token via x-adaptive-stash header", async () => {
		const token = crypto.randomUUID()
		put(token, { thinking: { type: "adaptive" }, effort: "max" })

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				const thinking = sent.thinking as Record<string, unknown>
				expect(thinking.type).toBe("adaptive")
				expect(thinking.budget_tokens).toBeUndefined()
				const config = sent.output_config as Record<string, unknown>
				expect(config.effort).toBe("max")
				// stash header must not leak
				expect(req.headers.get("x-adaptive-stash")).toBe(null)
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			thinking: { type: "enabled", budget_tokens: 1024 },
			max_tokens: 32000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-adaptive-stash": token,
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

	it("stash rewrite works without x-adaptive-effort header", async () => {
		const token = crypto.randomUUID()
		put(token, { thinking: { type: "adaptive" } })

		const server = Bun.serve({
			port: 0,
			fetch: async (req) => {
				const sent = (await req.json()) as Record<string, unknown>
				const thinking = sent.thinking as Record<string, unknown>
				expect(thinking.type).toBe("adaptive")
				// no effort stashed, so no output_config
				expect(sent.output_config).toBeUndefined()
				return new Response("ok")
			},
		})
		const url = `http://127.0.0.1:${server.port}`
		const body = JSON.stringify({
			model: "claude-opus-4-6",
			thinking: { type: "enabled", budget_tokens: 1024 },
			max_tokens: 32000,
			messages: [{ role: "user", content: "hello" }],
		})

		try {
			const res = await copilotMessagesFetch(
				url,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						"x-adaptive-stash": token,
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
})
