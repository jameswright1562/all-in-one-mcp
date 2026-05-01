export type RuntimeErrorResponse = {
  error?: string;
};

const runtimeBaseUrl = (
  import.meta.env.VITE_RUNTIME_URL || "http://127.0.0.1:4100"
).replace(/\/+$/, "");

function buildUrl(pathname: string, query?: Record<string, string | number>): URL {
  const url = new URL(pathname, `${runtimeBaseUrl}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

export async function requestJson<TResponse>(
  pathname: string,
  init?: RequestInit,
  query?: Record<string, string | number>,
): Promise<TResponse> {
  const response = await fetch(buildUrl(pathname, query), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | RuntimeErrorResponse
      | undefined;

    throw new Error(payload?.error || response.statusText || "Runtime request failed.");
  }

  if (response.status === 204) {
    return { ok: true } as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function createRuntimeEventSource(pathname: string): EventSource {
  return new EventSource(buildUrl(pathname).toString());
}
