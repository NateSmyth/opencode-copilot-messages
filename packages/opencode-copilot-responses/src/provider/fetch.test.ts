import { describe, expect, it } from "bun:test"
import { copilotResponsesFetch } from "./fetch"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function withServer(
	handler: (req: Request) => Response | Promise<Response>,
	run: (url: string) => Promise<void>
) {
	const server = Bun.serve({ port: 0, fetch: handler })
	try {
		await run(`http://127.0.0.1:${server.port}`)
	} finally {
		server.stop()
	}
}

function post(body: unknown, headers?: Record<string, string>) {
	return {
		method: "POST" as const,
		headers: { "content-type": "application/json", ...headers },
		body: typeof body === "string" ? body : JSON.stringify(body),
	}
}

describe("copilotResponsesFetch", () => {
	it("strips x-api-key and injects copilot headers", async () => {
		await withServer(
			(req) => {
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
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post(
						{ input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }] },
						{ "x-api-key": "sk-test" }
					),
					{ token: "gho_test" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("generates unique UUIDs per request", async () => {
		const ids: string[] = []
		await withServer(
			(req) => {
				ids.push(req.headers.get("x-request-id") ?? "")
				return new Response("ok")
			},
			async (url) => {
				await copilotResponsesFetch(url, post({ input: [] }), { token: "t" })
				await copilotResponsesFetch(url, post({ input: [] }), { token: "t" })
				expect(ids[0]).not.toBe(ids[1])
			}
		)
	})

	it("preserves non-conflicting caller headers", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-keep")).toBe("1")
				expect(req.headers.get("content-type")).toBe("application/json")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(url, post({ input: [] }, { "x-keep": "1" }), {
					token: "t",
				})
				expect(res.ok).toBe(true)
			}
		)
	})

	it("derives x-initiator user from user text input", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("user")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({ input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }] }),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("derives x-initiator agent from function_call_output", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({
						input: [
							{ role: "user", content: [{ type: "input_text", text: "run" }] },
							{ type: "function_call_output", call_id: "c1", output: "done" },
						],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("keeps caller-supplied x-initiator", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post(
						{ input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }] },
						{ "x-initiator": "agent" }
					),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("sets Copilot-Vision-Request when images are present", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("copilot-vision-request")).toBe("true")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({
						input: [
							{
								role: "user",
								content: [
									{ type: "input_image", image_url: { url: "data:image/png;base64,AA==" } },
								],
							},
						],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("omits Copilot-Vision-Request when images are absent", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("copilot-vision-request")).toBe(null)
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({ input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }] }),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("forces agent initiator for title generator instructions (string)", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({
						instructions: "You are a title generator. Provide a short title.",
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("forces agent initiator for title generator instructions (array)", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({
						instructions: [
							{ type: "text", text: "You are a title generator. Provide a short title." },
						],
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("forces agent initiator for system field fallback", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post({
						system: "You are a title generator. Provide a short title.",
						input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("does not throw on malformed body and defaults initiator to agent", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				expect(req.headers.get("copilot-vision-request")).toBe(null)
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(url, post("not-json"), { token: "t" })
				expect(res.ok).toBe(true)
			}
		)
	})
})
