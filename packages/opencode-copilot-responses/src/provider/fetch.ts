export interface FetchContext {
	token: string
}

export async function copilotResponsesFetch(
	_input: string | URL | Request,
	_init: RequestInit | undefined,
	_context: FetchContext,
): Promise<Response> {
	throw new Error("not implemented")
}
