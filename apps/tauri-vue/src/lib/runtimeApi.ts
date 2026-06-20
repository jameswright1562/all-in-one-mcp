export type RuntimeErrorResponse = {
  error?: string;
};

type RuntimeConfig = {
  baseUrl: string;
  adminToken: string;
};

const fallbackRuntimeBaseUrl = (
  import.meta.env.VITE_RUNTIME_URL ||
  (import.meta.env.DEV ? window.location.origin : "http://127.0.0.1:4100")
).replace(/\/+$/, "");
const fallbackRuntimeAdminToken =
  import.meta.env.VITE_RUNTIME_ADMIN_TOKEN || "";

let runtimeConfigPromise: Promise<RuntimeConfig> | null = null;

async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  if (runtimeConfigPromise) {
    return runtimeConfigPromise;
  }

  runtimeConfigPromise = (async () => {
    if (!import.meta.env.DEV && "__TAURI_INTERNALS__" in window) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const config = await invoke<RuntimeConfig>("runtime_config");
        return {
          baseUrl: config.baseUrl.replace(/\/+$/, ""),
          adminToken: config.adminToken,
        };
      } catch {
        // Fall back to environment/default configuration so web builds keep working.
      }
    }

    return {
      baseUrl: fallbackRuntimeBaseUrl,
      adminToken: fallbackRuntimeAdminToken,
    };
  })();

  return runtimeConfigPromise;
}

function buildUrl(
  baseUrl: string,
  pathname: string,
  query?: Record<string, string | number>,
): URL {
  const url = new URL(pathname, `${baseUrl}/`);

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
  const runtimeConfig = await loadRuntimeConfig();
  const response = await fetch(
    buildUrl(runtimeConfig.baseUrl, pathname, query),
    {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(runtimeConfig.adminToken
          ? { "x-all-in-one-mcp-admin-token": runtimeConfig.adminToken }
          : {}),
        ...init?.headers,
      },
    },
  );

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | RuntimeErrorResponse
      | undefined;
    throw new Error(
      payload?.error || `Runtime request failed (${response.status})`,
    );
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}
