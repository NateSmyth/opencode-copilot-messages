/**
 * Custom fetch wrapper for Copilot Messages API.
 *
 * Injects required headers and handles auth.
 */

import { buildHeaders, type HeaderContext } from "./headers";

export interface FetchContext extends HeaderContext {
  sessionToken: string;
}

export async function copilotMessagesFetch(
  _input: string | URL | Request,
  _init: RequestInit | undefined,
  context: FetchContext,
): Promise<Response> {
  const _headers = buildHeaders(context);
  // TODO: Implement copilotMessagesFetch()
  throw new Error("Not implemented");
}
