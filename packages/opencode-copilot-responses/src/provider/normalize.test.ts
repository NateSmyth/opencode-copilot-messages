import { describe, expect, it } from "bun:test"
import { normalizeReasoningIds } from "./normalize"

function sse(
	...events: Array<{ event: string; data: Record<string, unknown> }>
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder()
	const chunks = events.map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
	return new ReadableStream({
		start(controller) {
			for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
			controller.close()
		},
	})
}

async function collect(
	stream: ReadableStream<Uint8Array>
): Promise<Array<{ event: string; data: Record<string, unknown> }>> {
	const text = await new Response(stream).text()
	const results: Array<{ event: string; data: Record<string, unknown> }> = []
	for (const block of text.split("\n\n").filter(Boolean)) {
		const eventMatch = block.match(/^event: (.+)$/m)
		const dataMatch = block.match(/^data: (.+)$/m)
		if (eventMatch && dataMatch) {
			results.push({ event: eventMatch[1], data: JSON.parse(dataMatch[1]) })
		}
	}
	return results
}

describe("normalizeReasoningIds", () => {
	it("replaces rotated item_id in reasoning_summary_text.delta with canonical id", async () => {
		const stream = sse(
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 0,
					item: {
						type: "reasoning",
						id: "canonical-id",
						encrypted_content: "enc",
					},
				},
			},
			{
				event: "response.reasoning_summary_text.delta",
				data: {
					type: "response.reasoning_summary_text.delta",
					item_id: "rotated-id-1",
					output_index: 0,
					summary_index: 0,
					delta: "thinking",
				},
			},
			{
				event: "response.reasoning_summary_text.delta",
				data: {
					type: "response.reasoning_summary_text.delta",
					item_id: "rotated-id-2",
					output_index: 0,
					summary_index: 0,
					delta: " more",
				},
			}
		)

		const events = await collect(normalizeReasoningIds(stream))

		expect(events[1].data.item_id).toBe("canonical-id")
		expect(events[1].data.delta).toBe("thinking")
		expect(events[2].data.item_id).toBe("canonical-id")
		expect(events[2].data.delta).toBe(" more")
	})

	it("replaces rotated item_id in reasoning_summary_part.added", async () => {
		const stream = sse(
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 0,
					item: {
						type: "reasoning",
						id: "canonical-id",
						encrypted_content: "enc",
					},
				},
			},
			{
				event: "response.reasoning_summary_part.added",
				data: {
					type: "response.reasoning_summary_part.added",
					item_id: "rotated-id",
					output_index: 0,
					summary_index: 1,
				},
			}
		)

		const events = await collect(normalizeReasoningIds(stream))
		expect(events[1].data.item_id).toBe("canonical-id")
	})

	it("replaces rotated item_id in reasoning_summary_part.done", async () => {
		const stream = sse(
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 0,
					item: {
						type: "reasoning",
						id: "canonical-id",
						encrypted_content: "enc",
					},
				},
			},
			{
				event: "response.reasoning_summary_part.done",
				data: {
					type: "response.reasoning_summary_part.done",
					item_id: "rotated-id",
					output_index: 0,
					summary_index: 0,
				},
			}
		)

		const events = await collect(normalizeReasoningIds(stream))
		expect(events[1].data.item_id).toBe("canonical-id")
	})

	it("replaces rotated item.id in output_item.done for reasoning", async () => {
		const stream = sse(
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 0,
					item: {
						type: "reasoning",
						id: "canonical-id",
						encrypted_content: "enc",
					},
				},
			},
			{
				event: "response.output_item.done",
				data: {
					type: "response.output_item.done",
					output_index: 0,
					item: {
						type: "reasoning",
						id: "rotated-id",
						encrypted_content: "enc2",
						summary: [],
					},
				},
			}
		)

		const events = await collect(normalizeReasoningIds(stream))
		expect((events[1].data.item as Record<string, unknown>).id).toBe("canonical-id")
	})

	it("replaces rotated item.id and item_id in text events", async () => {
		const stream = sse(
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 1,
					item: { type: "message", id: "canonical-msg", role: "assistant" },
				},
			},
			{
				event: "response.content_part.added",
				data: {
					type: "response.content_part.added",
					item_id: "rotated-msg",
					output_index: 1,
					content_index: 0,
					part: { type: "output_text", text: "" },
				},
			},
			{
				event: "response.output_text.delta",
				data: {
					type: "response.output_text.delta",
					item_id: "rotated-msg-2",
					output_index: 1,
					content_index: 0,
					delta: "hello",
				},
			},
			{
				event: "response.output_item.done",
				data: {
					type: "response.output_item.done",
					output_index: 1,
					item: {
						type: "message",
						id: "rotated-msg-3",
						role: "assistant",
						content: [],
					},
				},
			}
		)

		const events = await collect(normalizeReasoningIds(stream))
		expect(events[1].data.item_id).toBe("canonical-msg")
		expect(events[2].data.item_id).toBe("canonical-msg")
		expect((events[3].data.item as Record<string, unknown>).id).toBe("canonical-msg")
	})

	it("does not modify non-reasoning events without output_index tracking", async () => {
		const stream = sse(
			{
				event: "response.created",
				data: { type: "response.created", response: { id: "resp-1" } },
			},
			{
				event: "response.completed",
				data: { type: "response.completed", response: { id: "resp-1" } },
			}
		)

		const events = await collect(normalizeReasoningIds(stream))
		expect(events[0].data.response).toEqual({ id: "resp-1" })
		expect(events[1].data.response).toEqual({ id: "resp-1" })
	})

	it("handles multiple output_index values independently", async () => {
		const stream = sse(
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 0,
					item: { type: "reasoning", id: "reason-canonical" },
				},
			},
			{
				event: "response.output_item.added",
				data: {
					type: "response.output_item.added",
					output_index: 1,
					item: { type: "message", id: "msg-canonical" },
				},
			},
			{
				event: "response.reasoning_summary_text.delta",
				data: {
					type: "response.reasoning_summary_text.delta",
					item_id: "reason-rotated",
					output_index: 0,
					summary_index: 0,
					delta: "thought",
				},
			},
			{
				event: "response.output_text.delta",
				data: {
					type: "response.output_text.delta",
					item_id: "msg-rotated",
					output_index: 1,
					content_index: 0,
					delta: "hello",
				},
			}
		)

		const events = await collect(normalizeReasoningIds(stream))
		expect(events[2].data.item_id).toBe("reason-canonical")
		expect(events[3].data.item_id).toBe("msg-canonical")
	})

	it("passes through chunks that split across SSE boundaries", async () => {
		const encoder = new TextEncoder()
		const full =
			`event: response.output_item.added\ndata: ${JSON.stringify({ type: "response.output_item.added", output_index: 0, item: { type: "reasoning", id: "canon" } })}\n\n` +
			`event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({ type: "response.reasoning_summary_text.delta", item_id: "rotated", output_index: 0, summary_index: 0, delta: "hi" })}\n\n`

		// Split mid-event to simulate chunked transfer
		const mid = Math.floor(full.length / 2)
		const stream = new ReadableStream({
			start(controller) {
				controller.enqueue(encoder.encode(full.slice(0, mid)))
				controller.enqueue(encoder.encode(full.slice(mid)))
				controller.close()
			},
		})

		const events = await collect(normalizeReasoningIds(stream))
		expect(events).toHaveLength(2)
		expect(events[1].data.item_id).toBe("canon")
	})
})
