// The Copilot proxy re-encrypts item IDs on every SSE event, producing
// different `item_id` / `item.id` values for what is logically the same
// output item.  The stock @ai-sdk/openai SDK tracks reasoning (and text)
// parts by these IDs, so rotated IDs cause "reasoning part … not found"
// errors in the Vercel AI core.
//
// This transform normalises the stream: on `response.output_item.added`
// we record the *first* id for each `output_index`, then rewrite every
// subsequent event that references the same `output_index` to use that
// canonical id.

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// SSE event types whose top-level `item_id` should be rewritten.
const ITEM_ID_EVENTS = new Set([
	"response.reasoning_summary_text.delta",
	"response.reasoning_summary_text.done",
	"response.reasoning_summary_part.added",
	"response.reasoning_summary_part.done",
	"response.output_text.delta",
	"response.output_text.done",
	"response.content_part.added",
	"response.content_part.done",
	"response.function_call_arguments.delta",
	"response.function_call_arguments.done",
])

export function normalizeReasoningIds(
	stream: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
	const canonical: Record<number, string> = {}
	let buffer = ""

	return stream.pipeThrough(
		new TransformStream<Uint8Array, Uint8Array>({
			transform(chunk, controller) {
				buffer += decoder.decode(chunk, { stream: true })
				const parts = buffer.split("\n\n")
				// keep incomplete trailing block in buffer
				buffer = parts.pop()!
				for (const block of parts) {
					controller.enqueue(encoder.encode(rewrite(block, canonical) + "\n\n"))
				}
			},
			flush(controller) {
				if (buffer.trim()) {
					controller.enqueue(encoder.encode(rewrite(buffer, canonical) + "\n\n"))
				}
			},
		})
	)
}

function rewrite(block: string, canonical: Record<number, string>): string {
	const dataMatch = block.match(/^data: (.+)$/m)
	if (!dataMatch) return block

	try {
		const data = JSON.parse(dataMatch[1]) as Record<string, unknown>
		const type = data.type as string | undefined
		if (!type) return block

		let changed = false

		// Record canonical id from output_item.added
		if (type === "response.output_item.added") {
			const item = data.item as Record<string, unknown> | undefined
			const idx = data.output_index as number | undefined
			if (item && idx !== undefined && typeof item.id === "string") {
				canonical[idx] = item.id
			}
			return block
		}

		// Rewrite item.id in output_item.done
		if (type === "response.output_item.done") {
			const item = data.item as Record<string, unknown> | undefined
			const idx = data.output_index as number | undefined
			if (item && idx !== undefined && canonical[idx] && item.id !== canonical[idx]) {
				item.id = canonical[idx]
				changed = true
			}
		}

		// Rewrite top-level item_id
		if (ITEM_ID_EVENTS.has(type)) {
			const idx = data.output_index as number | undefined
			if (idx !== undefined && canonical[idx] && data.item_id !== canonical[idx]) {
				data.item_id = canonical[idx]
				changed = true
			}
		}

		if (!changed) return block
		return block.replace(/^data: .+$/m, `data: ${JSON.stringify(data)}`)
	} catch {
		return block
	}
}
