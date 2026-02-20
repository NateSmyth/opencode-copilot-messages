import { describe, expect, it } from "bun:test"
import { RESPONSES_AGENT } from "../auth/headers"
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
				expect(req.headers.get("user-agent")).toBe(RESPONSES_AGENT)
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
						{
							input: [{ role: "user", content: [{ type: "input_text", text: "hi" }] }],
						},
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
					post({
						input: [
							{
								role: "user",
								content: [{ type: "input_text", text: "hello" }],
							},
						],
					}),
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
						{
							input: [
								{
									role: "user",
									content: [{ type: "input_text", text: "hello" }],
								},
							],
						},
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
									{
										type: "input_image",
										image_url: { url: "data:image/png;base64,AA==" },
									},
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
					post({
						input: [
							{
								role: "user",
								content: [{ type: "input_text", text: "hello" }],
							},
						],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it.each([
		{
			label: "instructions string",
			body: {
				instructions: "You are a title generator. Provide a short title.",
				input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
			},
		},
		{
			label: "instructions array",
			body: {
				instructions: [
					{
						type: "text",
						text: "You are a title generator. Provide a short title.",
					},
				],
				input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
			},
		},
		{
			label: "system field",
			body: {
				system: "You are a title generator. Provide a short title.",
				input: [{ role: "user", content: [{ type: "input_text", text: "hello" }] }],
			},
		},
	])("forces agent initiator for title generator via $label", async ({ body }) => {
		await withServer(
			(req) => {
				expect(req.headers.get("x-initiator")).toBe("agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(url, post(body), {
					token: "t",
				})
				expect(res.ok).toBe(true)
			}
		)
	})

	it("overrides conflicting caller headers with required copilot headers", async () => {
		await withServer(
			(req) => {
				expect(req.headers.get("authorization")).toBe("Bearer gho_real")
				expect(req.headers.get("x-interaction-type")).toBe("conversation-agent")
				return new Response("ok")
			},
			async (url) => {
				const res = await copilotResponsesFetch(
					url,
					post(
						{ input: [] },
						{
							authorization: "Bearer wrong",
							"x-interaction-type": "should-be-overwritten",
						}
					),
					{ token: "gho_real" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("derives agent initiator during multi-step tool loop", async () => {
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
							{
								role: "user",
								content: [{ type: "input_text", text: "search for X" }],
							},
							{
								type: "function_call",
								id: "fc1",
								name: "search",
								arguments: "{}",
							},
							{
								type: "function_call_output",
								call_id: "fc1",
								output: "result A",
							},
							{
								type: "function_call",
								id: "fc2",
								name: "summarize",
								arguments: "{}",
							},
							{
								type: "function_call_output",
								call_id: "fc2",
								output: "summary B",
							},
						],
					}),
					{ token: "t" }
				)
				expect(res.ok).toBe(true)
			}
		)
	})

	it("strips id from reasoning items in input", async () => {
		let received: unknown
		await withServer(
			async (req) => {
				received = await req.json()
				return new Response("ok")
			},
			async (url) => {
				await copilotResponsesFetch(
					url,
					post({
						input: [
							{ role: "user", content: [{ type: "input_text", text: "hi" }] },
							{
								type: "reasoning",
								id: "ZSBMzZFubPvHK4BK3ZoxLmQf1Gs==",
								summary: [{ type: "summary_text", text: "thinking" }],
								encrypted_content: "gAAAAA==",
							},
						],
					}),
					{ token: "t" }
				)
			}
		)
		const input = (received as Record<string, unknown>).input as unknown[]
		const reasoning = input[1] as Record<string, unknown>
		expect("id" in reasoning).toBe(false)
		expect(reasoning.type).toBe("reasoning")
		expect(reasoning.encrypted_content).toBe("gAAAAA==")
	})

	it("strips id from function_call items in input", async () => {
		let received: unknown
		await withServer(
			async (req) => {
				received = await req.json()
				return new Response("ok")
			},
			async (url) => {
				await copilotResponsesFetch(
					url,
					post({
						input: [
							{
								type: "function_call",
								id: "fc-encrypted-blob==",
								call_id: "call_123",
								name: "bash",
								arguments: "{}",
							},
						],
					}),
					{ token: "t" }
				)
			}
		)
		const input = (received as Record<string, unknown>).input as unknown[]
		const call = input[0] as Record<string, unknown>
		expect("id" in call).toBe(false)
		expect(call.call_id).toBe("call_123")
		expect(call.name).toBe("bash")
	})

	it("preserves id on item_reference items in input", async () => {
		let received: unknown
		await withServer(
			async (req) => {
				received = await req.json()
				return new Response("ok")
			},
			async (url) => {
				await copilotResponsesFetch(
					url,
					post({
						input: [{ type: "item_reference", id: "ref-id-to-keep" }],
					}),
					{ token: "t" }
				)
			}
		)
		const input = (received as Record<string, unknown>).input as unknown[]
		const ref = input[0] as Record<string, unknown>
		expect(ref.id).toBe("ref-id-to-keep")
		expect(ref.type).toBe("item_reference")
	})

	it("preserves non-id fields on all input items", async () => {
		let received: unknown
		await withServer(
			async (req) => {
				received = await req.json()
				return new Response("ok")
			},
			async (url) => {
				await copilotResponsesFetch(
					url,
					post({
						input: [
							{
								role: "user",
								content: [{ type: "input_text", text: "hello" }],
							},
							{
								type: "function_call_output",
								call_id: "c1",
								output: "done",
							},
						],
					}),
					{ token: "t" }
				)
			}
		)
		const input = (received as Record<string, unknown>).input as unknown[]
		expect((input[0] as Record<string, unknown>).role).toBe("user")
		expect((input[1] as Record<string, unknown>).call_id).toBe("c1")
		expect((input[1] as Record<string, unknown>).output).toBe("done")
	})

	it("normalizes reasoning ids in SSE response stream", async () => {
		const encoder = new TextEncoder()
		const events = [
			`event: response.output_item.added\ndata: ${JSON.stringify({
				type: "response.output_item.added",
				output_index: 0,
				item: { type: "reasoning", id: "canonical-abc" },
			})}\n\n`,
			`event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({
				type: "response.reasoning_summary_text.delta",
				item_id: "rotated-xyz",
				output_index: 0,
				summary_index: 0,
				delta: "thought",
			})}\n\n`,
		].join("")

		await withServer(
			() =>
				new Response(
					new ReadableStream({
						start(c) {
							c.enqueue(encoder.encode(events))
							c.close()
						},
					}),
					{ headers: { "content-type": "text/event-stream" } }
				),
			async (url) => {
				const res = await copilotResponsesFetch(url, post({ input: [] }), {
					token: "t",
				})
				const text = await res.text()
				const dataLines = text
					.split("\n")
					.filter((l) => l.startsWith("data: "))
					.map((l) => JSON.parse(l.slice(6)))
				expect(dataLines[1].item_id).toBe("canonical-abc")
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
				const res = await copilotResponsesFetch(url, post("not-json"), {
					token: "t",
				})
				expect(res.ok).toBe(true)
			}
		)
	})
})
