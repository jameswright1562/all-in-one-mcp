import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import selfsigned from "selfsigned";
import { createManagedMcpRuntime } from "../src/runtime.js";
import { startManagedMcpHttpServer } from "../src/server/httpServer.js";
import { startRuntimeGatewayServer } from "../src/testing/index.js";

const repoRoot = resolve(__dirname, "../../..");

function createTempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `${name}-`));
}

async function waitFor<T>(
  getter: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    let value: T | undefined;
    try {
      value = await getter();
    } catch {
      value = undefined;
    }

    if (value !== undefined && predicate(value)) {
      return value;
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }

  throw new Error(`Timed out after ${timeoutMs}ms.`);
}

async function createGatewayClient(
  port: number,
): Promise<{ client: Client; close: () => Promise<void> }> {
  const client = new Client(
    {
      name: "runtime-test-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    },
  );
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://127.0.0.1:${port}/mcp`),
  );
  await client.connect(transport);
  return {
    client,
    close: async () => {
      await transport.close();
      await client.close();
    },
  };
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not resolve free port."));
        return;
      }

      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePort(port);
      });
    });
  });
}

async function httpsGet(
  url: string,
): Promise<{ statusCode: number; body: string }> {
  return await new Promise((resolveResponse, rejectResponse) => {
    const request = httpsRequest(
      url,
      {
        rejectUnauthorized: false,
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          resolveResponse({
            statusCode: response.statusCode ?? 0,
            body,
          });
        });
      },
    );

    request.on("error", rejectResponse);
    request.end();
  });
}

function spawnHttpFixture(port: number, readyFile: string): ChildProcess {
  return spawn(
    process.execPath,
    [
      resolve(
        repoRoot,
        "packages/runtime/test/fixtures/streamable-http-server.mjs",
      ),
      String(port),
      readyFile,
    ],
    {
      cwd: repoRoot,
      stdio: "ignore",
    },
  );
}

const cleanupPaths: string[] = [];
const cleanupProcesses: ChildProcess[] = [];

afterEach(async () => {
  for (const child of cleanupProcesses.splice(0)) {
    child.kill();
  }

  for (const target of cleanupPaths.splice(0)) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        rmSync(target, { recursive: true, force: true });
        break;
      } catch {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
      }
    }
  }
});

describe("ManagedMcpRuntime", () => {
  it("reports health and the actual bound port when started with port 0", async () => {
    const tempDir = createTempDir("all-in-one-mcp-health");
    cleanupPaths.push(tempDir);

    const server = await startManagedMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      databasePath: join(tempDir, "runtime.sqlite"),
    });

    expect(server.port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${server.port}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });

    await server.close();
  }, 30_000);

  it("serves the MCP admin API from the standalone runtime server", async () => {
    const tempDir = createTempDir("all-in-one-mcp-http");
    cleanupPaths.push(tempDir);

    const port = await getFreePort();
    const server = await startManagedMcpHttpServer({
      host: "127.0.0.1",
      port,
      databasePath: join(tempDir, "runtime.sqlite"),
    });

    await fetch(`http://127.0.0.1:${port}/api/mcps`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-all-in-one-mcp-admin-token": server.adminToken,
      },
      body: JSON.stringify({
        id: "fixture",
        name: "Fixture",
        enabled: true,
        autoStart: true,
        toolPrefix: "fixture",
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [
          resolve(
            repoRoot,
            "packages/runtime/test/fixtures/stdio-tool-server.mjs",
          ),
        ],
        env: [],
      }),
    });

    const response = await fetch(`http://127.0.0.1:${port}/api/mcps`);
    const payload = (await response.json()) as {
      items: Array<{ definition: { id: string } }>;
    };
    expect(payload.items.some((item) => item.definition.id === "fixture")).toBe(
      true,
    );

    await server.close();
  }, 30_000);

  it("rejects unauthenticated admin mutations and oversized request bodies", async () => {
    const tempDir = createTempDir("all-in-one-mcp-http-auth");
    cleanupPaths.push(tempDir);

    const server = await startManagedMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      databasePath: join(tempDir, "runtime.sqlite"),
      adminToken: "test-token",
      maxBodyBytes: 64,
    });

    const unauthenticated = await fetch(
      `http://127.0.0.1:${server.port}/api/mcps`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
        },
        body: JSON.stringify({ id: "fixture" }),
      },
    );
    expect(unauthenticated.status).toBe(401);

    const oversized = await fetch(`http://127.0.0.1:${server.port}/api/mcps`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-all-in-one-mcp-admin-token": server.adminToken,
      },
      body: JSON.stringify({ payload: "x".repeat(200) }),
    });
    expect(oversized.status).toBe(413);

    await server.close();
  }, 30_000);

  it("serves HTTPS with an autogenerated self-signed certificate when ssl is enabled", async () => {
    const tempDir = createTempDir("all-in-one-mcp-https");
    cleanupPaths.push(tempDir);

    const server = await startManagedMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      databasePath: join(tempDir, "runtime.sqlite"),
      ssl: true,
    });

    const response = await httpsGet(`https://127.0.0.1:${server.port}/healthz`);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });

    await server.close();
  }, 30_000);

  it("serves HTTPS with certificate files when ssl paths are provided", async () => {
    const tempDir = createTempDir("all-in-one-mcp-https-files");
    cleanupPaths.push(tempDir);

    const certificates = await selfsigned.generate(
      [{ name: "commonName", value: "127.0.0.1" }],
      {
        algorithm: "sha256",
        extensions: [
          {
            name: "subjectAltName",
            altNames: [{ type: 7, ip: "127.0.0.1" }],
          },
        ],
      },
    );
    const certPath = join(tempDir, "runtime-cert.pem");
    const keyPath = join(tempDir, "runtime-key.pem");
    writeFileSync(certPath, certificates.cert, "utf8");
    writeFileSync(keyPath, certificates.private, "utf8");

    const server = await startManagedMcpHttpServer({
      host: "127.0.0.1",
      port: 0,
      databasePath: join(tempDir, "runtime.sqlite"),
      ssl: { certPath, keyPath },
    });

    const response = await httpsGet(`https://127.0.0.1:${server.port}/healthz`);
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ status: "ok" });

    await server.close();
  }, 30_000);

  it("records admin control logs and explicit state transitions", async () => {
    const tempDir = createTempDir("all-in-one-mcp-logs");
    cleanupPaths.push(tempDir);

    const runtime = createManagedMcpRuntime({
      databasePath: join(tempDir, "runtime.sqlite"),
    });
    await runtime.start();

    await runtime.createMcp({
      id: "fixture",
      name: "Fixture",
      enabled: true,
      autoStart: false,
      toolPrefix: "fixture",
      startupTimeoutMs: 5000,
      transport: "stdio",
      command: process.execPath,
      args: [
        resolve(
          repoRoot,
          "packages/runtime/test/fixtures/stdio-tool-server.mjs",
        ),
      ],
      env: [],
    });

    await runtime.startMcp("fixture");
    await waitFor(
      () => runtime.getMcp("fixture"),
      (snapshot) => snapshot.status === "ready",
    );
    await runtime.stopMcp("fixture");

    const logs = runtime.listLogs("fixture", 50);
    expect(
      logs.some((entry) =>
        entry.message.includes("[api.config] Managed MCP definition created."),
      ),
    ).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("[api.control] Start requested from admin API."),
      ),
    ).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("[runtime.state] stopped -> starting"),
      ),
    ).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("[runtime.state] starting -> ready"),
      ),
    ).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("[runtime.state] ready -> stopping"),
      ),
    ).toBe(true);
    expect(
      logs.some((entry) =>
        entry.message.includes("[runtime.state] stopping -> stopped"),
      ),
    ).toBe(true);

    await runtime.close();
  }, 30_000);

  it("shares one stdio child process across multiple downstream clients", async () => {
    const tempDir = createTempDir("all-in-one-mcp-runtime");
    cleanupPaths.push(tempDir);
    const lockPort = await getFreePort();

    const runtime = createManagedMcpRuntime({
      databasePath: join(tempDir, "runtime.sqlite"),
    });
    await runtime.start();

    await runtime.createMcp({
      id: "fixture",
      name: "Fixture",
      enabled: true,
      autoStart: true,
      toolPrefix: "fixture",
      startupTimeoutMs: 5000,
      transport: "stdio",
      command: process.execPath,
      args: [
        resolve(
          repoRoot,
          "packages/runtime/test/fixtures/stdio-tool-server.mjs",
        ),
        join(tempDir, "spawn-count.txt"),
        String(lockPort),
      ],
      env: [],
    });

    await waitFor(
      () => runtime.getMcp("fixture"),
      (snapshot) => snapshot.status === "ready",
    );

    const gateway = await startRuntimeGatewayServer(runtime);
    const clientOne = await createGatewayClient(gateway.port);
    const clientTwo = await createGatewayClient(gateway.port);

    const one = await clientOne.client.callTool({
      name: "fixture.echo",
      arguments: { text: "first" },
    });
    const two = await clientTwo.client.callTool({
      name: "fixture.echo",
      arguments: { text: "second" },
    });

    expect(one.content[0]).toMatchObject({ type: "text", text: "echo:first" });
    expect(two.content[0]).toMatchObject({ type: "text", text: "echo:second" });
    expect(readFileSync(join(tempDir, "spawn-count.txt"), "utf8")).toBe("1");

    await clientOne.close();
    await clientTwo.close();
    await gateway.close();
    await runtime.close();
  }, 30_000);

  it("does not expose disabled MCPs or disabled tools", async () => {
    const tempDir = createTempDir("all-in-one-mcp-disabled");
    cleanupPaths.push(tempDir);

    const runtime = createManagedMcpRuntime({
      databasePath: join(tempDir, "runtime.sqlite"),
    });
    await runtime.start();

    const fixtureArgs = [
      resolve(repoRoot, "packages/runtime/test/fixtures/stdio-tool-server.mjs"),
    ];

    await runtime.createMcp({
      id: "disabled",
      name: "Disabled",
      enabled: false,
      autoStart: true,
      toolPrefix: "disabled",
      startupTimeoutMs: 5000,
      transport: "stdio",
      command: process.execPath,
      args: fixtureArgs,
      env: [],
    });
    await runtime.createMcp({
      id: "filtered",
      name: "Filtered",
      enabled: true,
      autoStart: true,
      toolPrefix: "filtered",
      disabledTools: ["echo"],
      startupTimeoutMs: 5000,
      transport: "stdio",
      command: process.execPath,
      args: fixtureArgs,
      env: [],
    });

    await waitFor(
      () => runtime.getMcp("filtered"),
      (snapshot) => snapshot.status === "ready",
    );

    expect(runtime.getExposedTools().map((tool) => tool.name)).not.toContain(
      "disabled.echo",
    );
    expect(runtime.getExposedTools().map((tool) => tool.name)).not.toContain(
      "filtered.echo",
    );
    await expect(runtime.startMcp("disabled")).rejects.toThrow(
      'MCP "disabled" is disabled.',
    );
    await expect(
      runtime.callTool("filtered.echo", { text: "nope" }),
    ).rejects.toThrow('Unknown tool "filtered.echo".');

    await runtime.close();
  }, 30_000);

  it("reconnects to a streamable HTTP upstream after failure", async () => {
    const tempDir = createTempDir("all-in-one-mcp-remote");
    cleanupPaths.push(tempDir);

    const port = await getFreePort();
    const readyFile = join(tempDir, "ready.txt");
    const fixture = spawnHttpFixture(port, readyFile);
    cleanupProcesses.push(fixture);

    await waitFor(
      () =>
        existsSync(readyFile) ? readFileSync(readyFile, "utf8") : undefined,
      (value) => value === String(port),
    );

    const runtime = createManagedMcpRuntime({
      databasePath: join(tempDir, "runtime.sqlite"),
    });
    await runtime.start();

    await runtime.createMcp({
      id: "remote",
      name: "Remote Fixture",
      enabled: true,
      autoStart: true,
      toolPrefix: "remote",
      startupTimeoutMs: 5000,
      transport: "streamable-http",
      url: `http://127.0.0.1:${port}/mcp`,
      headers: [],
    });

    await waitFor(
      () => runtime.getMcp("remote"),
      (snapshot) => snapshot.status === "ready",
    );

    const first = await runtime.callTool("remote.echo", { text: "before" });
    expect(first.content[0]).toMatchObject({ text: "remote:before" });

    fixture.kill();
    await waitFor(
      () => runtime.getMcp("remote"),
      (snapshot) =>
        snapshot.status === "error" || snapshot.status === "degraded",
    );

    const fixtureRestarted = spawnHttpFixture(port, readyFile);
    cleanupProcesses.push(fixtureRestarted);

    await waitFor(
      () => runtime.getMcp("remote"),
      (snapshot) => snapshot.status === "ready",
      20_000,
    );
    const second = await runtime.callTool("remote.echo", { text: "after" });
    expect(second.content[0]).toMatchObject({ text: "remote:after" });

    await runtime.close();
  }, 30_000);

  it("proxies the gateway over stdio for legacy clients", async () => {
    const tempDir = createTempDir("all-in-one-mcp-proxy");
    cleanupPaths.push(tempDir);

    const runtime = createManagedMcpRuntime({
      databasePath: join(tempDir, "runtime.sqlite"),
    });
    await runtime.start();

    await runtime.createMcp({
      id: "fixture",
      name: "Fixture",
      enabled: true,
      autoStart: true,
      toolPrefix: "fixture",
      startupTimeoutMs: 5000,
      transport: "stdio",
      command: process.execPath,
      args: [
        resolve(
          repoRoot,
          "packages/runtime/test/fixtures/stdio-tool-server.mjs",
        ),
      ],
      env: [],
    });

    await waitFor(
      () => runtime.getMcp("fixture"),
      (snapshot) => snapshot.status === "ready",
    );

    const gateway = await startRuntimeGatewayServer(runtime);
    const client = new Client(
      {
        name: "proxy-test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      },
    );
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        resolve(repoRoot, "packages/runtime/dist/cli.js"),
        "stdio-proxy",
        "--url",
        `http://127.0.0.1:${gateway.port}/mcp`,
      ],
    });

    await client.connect(transport);
    const result = await client.callTool({
      name: "fixture.echo",
      arguments: { text: "proxy" },
    });
    expect(result.content[0]).toMatchObject({ text: "echo:proxy" });

    await transport.close();
    await client.close();
    await gateway.close();
    await runtime.close();
  }, 30_000);
});
