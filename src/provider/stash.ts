const store = new Map<string, { thinking?: unknown; effort?: unknown }>()

export function put(token: string, value: { thinking?: unknown; effort?: unknown }): void {
	store.set(token, structuredClone(value))
}

export function take(token: string): { thinking?: unknown; effort?: unknown } | null {
	const saved = store.get(token)
	if (!saved) return null
	store.delete(token)
	return saved
}
