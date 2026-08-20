import "server-only";

import type { ApiMethod, BackendApiResponse } from "./types";

interface ServerApiRequestOptions<TBody> {
  method?: ApiMethod;
  body?: TBody;
  headers?: HeadersInit;
}

export const serverApiClient = async <TData, TBody = unknown>(
  baseUrl: string,
  path: string,
  options: ServerApiRequestOptions<TBody> = {},
) => {
  const { body, headers, method = "GET" } = options;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  const responseText = await response.text();
  const result = responseText
    ? (JSON.parse(responseText) as BackendApiResponse<TData>)
    : ({
        success: false,
        message: response.ok ? "Empty response from upstream service." : "Upstream request failed.",
        timestamp: new Date().toISOString(),
      } as BackendApiResponse<TData>);

  return { response, result };
};
