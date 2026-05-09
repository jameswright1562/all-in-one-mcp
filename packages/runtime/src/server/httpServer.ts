import {
  createServer,
  type IncomingMessage,
  type Server as NodeServer,
  type ServerResponse,
} from "node:http";
import type { ProfileDefinition } from "@all-in-one-mcp/contracts";
import { createManagedMcpRuntime, type ManagedMcpRuntime } from "../runtime.js";

export type ManagedMcpHttpServerOptions = {
  host?: string;
  port?: number;
  databasePath?: string;
};

export type ManagedMcpHttpServer = {
  host: string;
  port: number;
  runtime: ManagedMcpRuntime;
  close: () => Promise<void>;
};

function normalizeLimit(value: string | null, fallback = 200): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(5_000, Math.trunc(parsed)));
}

function json(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("x-content-type-options", "nosniff");
  response.end(JSON.stringify(body));
}

function setCorsHeaders(response: ServerResponse): void {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader(
    "access-control-allow-methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  response.setHeader("access-control-allow-headers", "content-type");
}

function noContent(response: ServerResponse): void {
  response.statusCode = 204;
  response.end();
}

function normalizeError(error: unknown): {
  statusCode: number;
  message: string;
} {
  if (error instanceof Error) {
    if (
      error.message.startsWith('Unknown MCP "') ||
      error.message.startsWith('Unknown profile "')
    ) {
      return {
        statusCode: 404,
        message: error.message,
      };
    }

    if (error.message.includes("already exists")) {
      return {
        statusCode: 409,
        message: error.message,
      };
    }

    return {
      statusCode: 400,
      message: error.message,
    };
  }

  return {
    statusCode: 500,
    message: "Internal server error",
  };
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  return await new Promise((resolveBody, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      resolveBody(raw.length > 0 ? JSON.parse(raw) : undefined);
    });
    request.on("error", reject);
  });
}

function getIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  return parts[2] ?? null;
}

function writeSseHeaders(response: ServerResponse): void {
  response.statusCode = 200;
  response.setHeader("content-type", "text/event-stream");
  response.setHeader("cache-control", "no-cache, no-transform");
  response.setHeader("connection", "keep-alive");
}

async function handleRequest(
  runtime: ManagedMcpRuntime,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "127.0.0.1"}`,
  );
  const pathname = url.pathname;
  const isCorsPath =
    pathname === "/healthz" || pathname === "/mcp" || pathname.startsWith("/api/");

  if (isCorsPath) {
    setCorsHeaders(response);
  }

  if (isCorsPath && request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (pathname === "/healthz" && request.method === "GET") {
    json(response, 200, { status: "ok" });
    return;
  }

  if (pathname === "/mcp") {
    const body =
      request.method === "POST" ? await readBody(request) : undefined;
    await runtime.handleGatewayHttpRequest(request, response, body);
    return;
  }

  if (pathname === "/api/events" && request.method === "GET") {
    writeSseHeaders(response);
    response.write(
      `event: ready\ndata: ${JSON.stringify(runtime.listMcps())}\n\n`,
    );
    response.write(
      `event: profiles-ready\ndata: ${JSON.stringify(runtime.listProfiles())}\n\n`,
    );

    const unsubscribe = runtime.subscribe((payload) => {
      response.write(
        `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`,
      );
    });
    const unsubscribeProfiles = runtime.subscribeProfiles((payload) => {
      response.write(
        `event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`,
      );
    });
    const heartbeat = setInterval(() => {
      response.write(": keepalive\n\n");
    }, 15_000);

    request.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      unsubscribeProfiles();
      response.end();
    });
    return;
  }

  if (pathname === "/api/mcps" && request.method === "GET") {
    json(response, 200, runtime.listMcps());
    return;
  }

  if (pathname === "/api/mcps" && request.method === "POST") {
    const body = await readBody(request);
    json(response, 200, await runtime.createMcp(body as never));
    return;
  }

  if (/^\/api\/mcps\/[^/]+$/.test(pathname)) {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing MCP id." });
      return;
    }

    if (request.method === "GET") {
      json(response, 200, runtime.getMcp(id));
      return;
    }

    if (request.method === "PATCH") {
      const body = await readBody(request);
      json(response, 200, await runtime.updateMcp(id, body as never));
      return;
    }

    if (request.method === "DELETE") {
      await runtime.deleteMcp(id);
      noContent(response);
      return;
    }
  }

  if (/^\/api\/mcps\/[^/]+\/logs$/.test(pathname) && request.method === "GET") {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing MCP id." });
      return;
    }

    json(response, 200, {
      items: runtime.listLogs(
        id,
        normalizeLimit(url.searchParams.get("limit")),
      ),
      generatedAt: new Date().toISOString(),
    });
    return;
  }

  if (
    /^\/api\/mcps\/[^/]+\/start$/.test(pathname) &&
    request.method === "POST"
  ) {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing MCP id." });
      return;
    }

    json(response, 200, await runtime.startMcp(id));
    return;
  }

  if (
    /^\/api\/mcps\/[^/]+\/stop$/.test(pathname) &&
    request.method === "POST"
  ) {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing MCP id." });
      return;
    }

    json(response, 200, await runtime.stopMcp(id));
    return;
  }

  if (
    /^\/api\/mcps\/[^/]+\/restart$/.test(pathname) &&
    request.method === "POST"
  ) {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing MCP id." });
      return;
    }

    json(response, 200, await runtime.restartMcp(id));
    return;
  }

  // -------------------------------------------------------------------------
  // Profile endpoints
  // -------------------------------------------------------------------------

  if (pathname === "/api/profiles" && request.method === "GET") {
    json(response, 200, runtime.listProfiles());
    return;
  }

  if (pathname === "/api/profiles" && request.method === "POST") {
    const body = await readBody(request);
    json(response, 200, runtime.createProfile(body as ProfileDefinition));
    return;
  }

  // Exact-match routes BEFORE the generic :id pattern
  if (pathname === "/api/profiles/deactivate" && request.method === "POST") {
    await runtime.activateProfile(null);
    json(response, 200, { activeProfileId: null });
    return;
  }

  if (
    /^\/api\/profiles\/[^/]+\/activate$/.test(pathname) &&
    request.method === "POST"
  ) {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing profile id." });
      return;
    }

    await runtime.activateProfile(id);
    json(response, 200, { activeProfileId: id });
    return;
  }

  if (/^\/api\/profiles\/[^/]+$/.test(pathname)) {
    const id = getIdFromPath(pathname);
    if (!id) {
      json(response, 400, { error: "Missing profile id." });
      return;
    }

    if (request.method === "GET") {
      json(response, 200, runtime.getProfile(id));
      return;
    }

    if (request.method === "PATCH") {
      const body = await readBody(request);
      json(
        response,
        200,
        runtime.updateProfile(id, body as ProfileDefinition),
      );
      return;
    }

    if (request.method === "DELETE") {
      runtime.deleteProfile(id);
      noContent(response);
      return;
    }
  }

  json(response, 404, { error: "Not found." });
}

export async function startManagedMcpHttpServer(
  options: ManagedMcpHttpServerOptions = {},
): Promise<ManagedMcpHttpServer> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4100;
  const runtime = createManagedMcpRuntime({
    databasePath: options.databasePath,
  });
  await runtime.start();

  const server: NodeServer = createServer(async (request, response) => {
    try {
      await handleRequest(runtime, request, response);
    } catch (error) {
      const normalized = normalizeError(error);
      json(response, normalized.statusCode, { error: normalized.message });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(port, host, (error?: Error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine the runtime bind address.");
  }

  return {
    host,
    port: address.port,
    runtime,
    close: async () => {
      await runtime.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    },
  };
}
