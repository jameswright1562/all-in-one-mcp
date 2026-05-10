import {
  createServer,
  type IncomingMessage,
  type Server as NodeServer,
  type ServerResponse,
} from "node:http";
import { createServer as createSecureServer } from "node:https";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { isIP } from "node:net";
import selfsigned from "selfsigned";
import {
  normalizeError,
  type ProfileDefinition,
} from "@all-in-one-mcp/contracts";
import {
  createLogger,
  shutdown,
  withRequestContext,
} from "@all-in-one-mcp/shared";
import { createManagedMcpRuntime, type ManagedMcpRuntime } from "../runtime.js";

export type ManagedMcpHttpServerOptions = {
  host?: string;
  port?: number;
  databasePath?: string;
  ssl?: boolean | { certPath: string; keyPath: string };
};

export type ManagedMcpHttpServer = {
  host: string;
  port: number;
  runtime: ManagedMcpRuntime;
  close: () => Promise<void>;
};

type ServerTlsCredentials = {
  cert: string;
  key: string;
};

type SubjectAltName = { type: 2; value: string } | { type: 7; ip: string };

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

function writeResponse(
  response: ServerResponse,
  upstreamResponse: Response,
): Promise<void> {
  response.statusCode = upstreamResponse.status;

  for (const [key, value] of upstreamResponse.headers.entries()) {
    response.setHeader(key, value);
  }

  if (!upstreamResponse.body) {
    response.end();
    return Promise.resolve();
  }

  return upstreamResponse.arrayBuffer().then((buffer) => {
    response.end(Buffer.from(buffer));
  });
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

function normalizeHttpError(error: unknown): {
  statusCode: number;
  message: string;
} {
  const message = normalizeError(error);

  if (
    message.startsWith('Unknown MCP "') ||
    message.startsWith('Unknown profile "')
  ) {
    return { statusCode: 404, message };
  }

  if (message.includes("already exists")) {
    return { statusCode: 409, message };
  }

  if (error instanceof Error) {
    return { statusCode: 400, message };
  }

  return { statusCode: 500, message: "Internal server error" };
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

function normalizeCertificateHost(host: string): string {
  if (host === "0.0.0.0" || host === "::") {
    return "localhost";
  }

  return host;
}

function createSubjectAltNames(host: string): SubjectAltName[] {
  const altNames: SubjectAltName[] = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
    { type: 7, ip: "::1" },
  ];
  const normalizedHost = normalizeCertificateHost(host);
  const ipVersion = isIP(normalizedHost);

  if (ipVersion === 4 || ipVersion === 6) {
    if (
      !altNames.some((entry) => entry.type === 7 && entry.ip === normalizedHost)
    ) {
      altNames.push({ type: 7, ip: normalizedHost });
    }
    return altNames;
  }

  if (
    !altNames.some(
      (entry) => entry.type === 2 && entry.value === normalizedHost,
    )
  ) {
    altNames.push({ type: 2, value: normalizedHost });
  }

  return altNames;
}

async function resolveTlsCredentials(
  ssl: ManagedMcpHttpServerOptions["ssl"],
  host: string,
): Promise<ServerTlsCredentials | null> {
  if (!ssl) {
    return null;
  }

  if (typeof ssl === "object") {
    const [cert, key] = await Promise.all([
      fs.readFile(ssl.certPath, "utf8"),
      fs.readFile(ssl.keyPath, "utf8"),
    ]);
    return { cert, key };
  }

  const normalizedHost = normalizeCertificateHost(host);
  const certificates = await selfsigned.generate(
    [{ name: "commonName", value: normalizedHost }],
    {
      algorithm: "sha256",
      extensions: [
        {
          name: "subjectAltName",
          altNames: createSubjectAltNames(host),
        },
      ],
    },
  );

  return {
    cert: certificates.cert,
    key: certificates.private,
  };
}

function toWebRequest(request: IncomingMessage, parsedBody?: unknown): Request {
  const protocol = (request.socket as { encrypted?: boolean }).encrypted
    ? "https"
    : "http";
  const url = new URL(
    request.url ?? "/",
    `${protocol}://${request.headers.host ?? "127.0.0.1"}`,
  );
  const headers = new Headers();

  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(key, item);
      }
    } else {
      headers.set(key, value);
    }
  }

  if (parsedBody !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const init: RequestInit = {
    method: request.method ?? "GET",
    headers,
  };

  if (
    request.method !== "GET" &&
    request.method !== "HEAD" &&
    parsedBody !== undefined
  ) {
    init.body = JSON.stringify(parsedBody);
  }

  return new Request(url, {
    ...init,
  });
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
    pathname === "/healthz" ||
    pathname === "/livez" ||
    pathname === "/readyz" ||
    pathname === "/mcp" ||
    pathname.startsWith("/api/");

  if (isCorsPath) {
    setCorsHeaders(response);
  }

  if (isCorsPath && request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (
    (pathname === "/healthz" || pathname === "/livez") &&
    request.method === "GET"
  ) {
    json(response, 200, { status: "ok" });
    return;
  }

  if (pathname === "/readyz" && request.method === "GET") {
    const ready = runtime.isReady();
    json(response, ready ? 200 : 503, {
      status: ready ? "ok" : "degraded",
      checks: {
        supervisor: ready,
        sqlite: ready,
      },
    });
    return;
  }

  if (pathname === "/mcp") {
    const body =
      request.method === "POST" ? await readBody(request) : undefined;
    const gatewayResponse = await runtime.handleGatewayHttpRequest(
      toWebRequest(request, body),
      body,
    );
    await writeResponse(response, gatewayResponse);
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
      json(response, 200, runtime.updateProfile(id, body as ProfileDefinition));
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
    ...(options.databasePath ? { databasePath: options.databasePath } : {}),
  });
  await runtime.start();
  const logger = createLogger("runtime.httpServer", {
    base: { host, port },
  });

  const requestHandler = async (
    request: IncomingMessage,
    response: ServerResponse,
  ) => {
    const requestId = randomUUID();
    response.setHeader("x-request-id", requestId);

    await withRequestContext({ requestId }, async () => {
      try {
        await handleRequest(runtime, request, response);
      } catch (error) {
        const normalized = normalizeHttpError(error);
        logger.error(
          {
            err: error,
            method: request.method,
            url: request.url,
            requestId,
          },
          "HTTP request failed",
        );
        json(response, normalized.statusCode, { error: normalized.message });
      }
    });
  };

  const tlsCredentials = await resolveTlsCredentials(options.ssl, host);
  const server: NodeServer = tlsCredentials
    ? createSecureServer(
        {
          key: tlsCredentials.key,
          cert: tlsCredentials.cert,
        },
        requestHandler,
      )
    : createServer(requestHandler);

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
      await shutdown(10_000, [
        async () => {
          await runtime.close();
        },
        async () => {
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
      ]);
    },
  };
}
