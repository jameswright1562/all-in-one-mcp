#!/usr/bin/env node
import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createLogger, shutdown } from "@all-in-one-mcp/shared";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { startManagedMcpHttpServer } from "./server/httpServer.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };
const logger = createLogger("runtime.cli");

interface EventTarget {
  on(event: string, listener: (...args: unknown[]) => void): void;
  once(event: string, listener: (...args: unknown[]) => void): void;
}

function hasFlag(...flags: string[]): boolean {
  return flags.some((flag) => process.argv.includes(flag));
}

function readArgument(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error(
      `Invalid port "${value}". Expected an integer between 0 and 65535.`,
    );
  }

  return port;
}

function runtimeServiceHost(host: string): string {
  if (host === "0.0.0.0" || host === "::") {
    return "127.0.0.1";
  }

  return host;
}

function isEnabled(value: string | undefined): boolean {
  return ["1", "true", "yes"].includes(value?.toLowerCase() ?? "");
}

function resolveSslOption():
  | { certPath: string; keyPath: string }
  | boolean
  | undefined {
  const certPath =
    readArgument("--ssl-cert") ?? process.env.ALL_IN_ONE_MCP_SSL_CERT;
  const keyPath =
    readArgument("--ssl-key") ?? process.env.ALL_IN_ONE_MCP_SSL_KEY;

  if ((certPath && !keyPath) || (!certPath && keyPath)) {
    throw new Error("SSL certificate and key paths must be provided together.");
  }

  if (certPath && keyPath) {
    return { certPath, keyPath };
  }

  return hasFlag("--ssl") || isEnabled(process.env.ALL_IN_ONE_MCP_SSL)
    ? true
    : undefined;
}

async function stopChildProcess(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  child.kill("SIGTERM");

  await Promise.race([
    new Promise<void>((resolve) => {
      (child as unknown as EventTarget).once("exit", () => resolve());
    }),
    new Promise<void>((resolve) => {
      setTimeout(() => {
        if (child.exitCode === null && !child.killed) {
          child.kill("SIGKILL");
        }
        resolve();
      }, 5_000);
    }),
  ]);
}

async function startDashboardServer(
  runtimeHost: string,
  runtimePort: number,
  runtimeProtocol: "http" | "https",
  dashboardHost: string,
  dashboardPort: number,
): Promise<ChildProcess> {
  const dashboardEntrypoint = fileURLToPath(
    new URL("./dashboard/server/index.mjs", import.meta.url),
  );
  await access(dashboardEntrypoint);

  const child = spawn(process.execPath, [dashboardEntrypoint], {
    stdio: "inherit",
    env: {
      ...process.env,
      NITRO_HOST: dashboardHost,
      NITRO_PORT: String(dashboardPort),
      ALL_IN_ONE_MCP_RUNTIME_URL: `${runtimeProtocol}://${runtimeServiceHost(runtimeHost)}:${runtimePort}`,
      ...(runtimeProtocol === "https"
        ? { NODE_TLS_REJECT_UNAUTHORIZED: "0" }
        : {}),
    },
  });

  (child as unknown as EventTarget).on("error", (...args: unknown[]) => {
    const error = args[0] as Error | undefined;
    process.stderr.write(
      `Failed to start dashboard: ${error?.message ?? "Unknown error"}\n`,
    );
  });

  return child;
}

function printUsage(): void {
  process.stdout.write(
    `all-in-one-mcp v${version}

Usage:
  all-in-one-mcp serve [--host 127.0.0.1] [--port 4100] [--database /path/to/runtime.sqlite] [--ssl] [--ssl-cert /path/to/cert.pem --ssl-key /path/to/key.pem] [--dashboard] [--dashboard-port 4101]
  all-in-one-mcp stdio-proxy --url http://127.0.0.1:4100/mcp

Environment:
  ALL_IN_ONE_MCP_HOST
  ALL_IN_ONE_MCP_PORT
  ALL_IN_ONE_MCP_DATABASE
  ALL_IN_ONE_MCP_SSL
  ALL_IN_ONE_MCP_SSL_CERT
  ALL_IN_ONE_MCP_SSL_KEY
  ALL_IN_ONE_MCP_DASHBOARD
  ALL_IN_ONE_MCP_DASHBOARD_PORT
  ALL_IN_ONE_MCP_URL
  ALL_IN_ONE_MCP_HOME
`,
  );
}

async function runStdioProxy(urlString: string): Promise<void> {
  const client = new Client(
    {
      name: "all-in-one-mcp-stdio-proxy",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );
  const upstreamTransport = new StreamableHTTPClientTransport(
    new URL(urlString),
  );
  const stdioServer = new Server(
    {
      name: "all-in-one-mcp-stdio-proxy",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {
          listChanged: true,
        },
      },
    },
  );
  const stdioTransport = new StdioServerTransport();

  stdioServer.setRequestHandler(ListToolsRequestSchema, async () => {
    return client.listTools();
  });

  stdioServer.setRequestHandler(CallToolRequestSchema, async (request) => {
    return client.callTool({
      name: request.params.name,
      arguments: request.params.arguments as
        | Record<string, unknown>
        | undefined,
    });
  });

  client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
    await stdioServer.sendToolListChanged();
  });

  client.onerror = (error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
  };

  await client.connect(upstreamTransport as Parameters<Client["connect"]>[0]);
  await stdioServer.connect(stdioTransport);
}

async function main(): Promise<void> {
  if (hasFlag("--help", "-h")) {
    printUsage();
    return;
  }

  if (hasFlag("--version", "-v")) {
    process.stdout.write(`${version}\n`);
    return;
  }

  const command =
    process.argv[2] && !process.argv[2].startsWith("--")
      ? process.argv[2]
      : "serve";

  if (command === "serve") {
    const host =
      readArgument("--host") ?? process.env.ALL_IN_ONE_MCP_HOST ?? "127.0.0.1";
    const port = parsePort(
      readArgument("--port") ?? process.env.ALL_IN_ONE_MCP_PORT ?? "4100",
    );
    const databasePath =
      readArgument("--database") ?? process.env.ALL_IN_ONE_MCP_DATABASE;
    const dashboardEnabled =
      hasFlag("--dashboard") || isEnabled(process.env.ALL_IN_ONE_MCP_DASHBOARD);
    const dashboardPort = parsePort(
      readArgument("--dashboard-port") ??
        process.env.ALL_IN_ONE_MCP_DASHBOARD_PORT ??
        String(Math.min(port + 1, 65_535)),
    );
    const ssl = resolveSslOption();
    const protocol = ssl ? "https" : "http";

    const server = await startManagedMcpHttpServer({
      host,
      port,
      ...(databasePath ? { databasePath } : {}),
      ...(ssl ? { ssl } : {}),
    });
    let dashboardProcess: ChildProcess | null = null;

    if (dashboardEnabled) {
      try {
        dashboardProcess = await startDashboardServer(
          host,
          server.port,
          protocol,
          host,
          dashboardPort,
        );
      } catch (error) {
        await server.close();
        const message = `Dashboard bundle is unavailable. Reinstall or repack all-in-one-mcp with the dashboard bundle included. ${
          error instanceof Error ? error.message : String(error)
        }`;
        throw new Error(message, {
          cause: error,
        });
      }
    }

    process.stdout.write(
      `all-in-one-mcp listening on ${protocol}://${server.host}:${server.port}\n`,
    );
    process.stdout.write(
      `MCP endpoint: ${protocol}://${server.host}:${server.port}/mcp\n`,
    );
    process.stdout.write(
      `Admin API: ${protocol}://${server.host}:${server.port}/api/mcps\n`,
    );
    process.stdout.write(
      `Liveness: ${protocol}://${server.host}:${server.port}/livez\n`,
    );
    process.stdout.write(
      `Readiness: ${protocol}://${server.host}:${server.port}/readyz\n`,
    );
    if (dashboardEnabled) {
      process.stdout.write(`Dashboard: http://${host}:${dashboardPort}\n`);
    }

    const closeServer = async () => {
      try {
        await shutdown(10_000, [
          async () => {
            await stopChildProcess(dashboardProcess);
          },
          async () => {
            await server.close();
          },
        ]);
      } catch (error) {
        logger.error({ err: error }, "Runtime shutdown failed");
        process.exitCode = 1;
      } finally {
        process.exit();
      }
    };

    process.once("SIGINT", () => {
      void closeServer();
    });
    process.once("SIGTERM", () => {
      void closeServer();
    });
    return;
  }

  if (command === "stdio-proxy") {
    const url = readArgument("--url") ?? process.env.ALL_IN_ONE_MCP_URL;
    if (!url) {
      process.stderr.write("Missing required --url argument.\n");
      process.exitCode = 1;
      return;
    }

    new URL(url);
    await runStdioProxy(url);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

void main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
