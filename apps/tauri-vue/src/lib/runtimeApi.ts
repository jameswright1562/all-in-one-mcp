export type RuntimeErrorResponse = {
  error?: string;
};

declare global {
  interface Window {
    __ALL_IN_ONE_MCP_RUNTIME_BASE_URL__?: string;
  }
}

function readInjectedRuntimeBaseUrl(): string | undefined {
  const injected = window.__ALL_IN_ONE_MCP_RUNTIME_BASE_URL__;
  return injected?.replace(/\/+$/, "");
}

export function resolveRuntimeBaseUrl(): string {
  const injected = readInjectedRuntimeBaseUrl();
  if (injected) {
    return injected;
  }

  if (import.meta.env.VITE_RUNTIME_URL) {
    return String(import.meta.env.VITE_RUNTIME_URL).replace(/\/+$/, "");
  }

  if (import.meta.env.DEV) {
    return window.location.origin.replace(/\/+$/, "");
  }

  return "http://127.0.0.1:4100";
}

const runtimeBaseUrl = resolveRuntimeBaseUrl();

function buildUrl(
  pathname: string,
  query?: Record<string, string | number>,
): URL {
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

    throw new Error(
      payload?.error || response.statusText || "Runtime request failed.",
    );
  }

  if (response.status === 204) {
    return { ok: true } as TResponse;
  }

  return (await response.json()) as TResponse;
}

export function createRuntimeEventSource(pathname: string): EventSource {
  return new EventSource(buildUrl(pathname).toString());
}
