import { type Stream } from "node:stream";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  LoggingMessageNotificationSchema,
  ToolListChangedNotificationSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import {
  managedMcpStatusSchema,
  type KeyValuePair,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ManagedMcpStatus,
  type ManagedTool,
} from "../contracts/index.js";
import { LineBuffer } from "../logging/lineBuffer.js";

type UpstreamTool = Omit<ManagedTool, "name"> & { upstreamName: string };
type SupervisorLogDraft = Omit<ManagedMcpLogEntry, "id">;

type SupervisorHooks = {
  onStateChanged: () => void;
  onLog: (entry: SupervisorLogDraft) => void;
};

function isoNow(): string {
  return new Date().toISOString();
}

function taggedMessage(tag: string, message: string): string {
  return `[${tag}] ${message}`;
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

export class ManagedMcpSupervisor {
  private definition: ManagedMcpDefinition;
  private client: Client | null = null;
  private transport:
    | StdioClientTransport
    | StreamableHTTPClientTransport
    | null = null;
  private tools: UpstreamTool[] = [];
  private status: ManagedMcpStatus = managedMcpStatusSchema.parse("stopped");
  private lastError?: string;
  private updatedAt = isoNow();
  private restartTimer: NodeJS.Timeout | null = null;
  private restartAttempt = 0;
  private startPromise: Promise<void> | null = null;
  private stopping = false;
  private disposing = false;

  constructor(
    definition: ManagedMcpDefinition,
    private readonly hooks: SupervisorHooks,
  ) {
    this.definition = definition;
  }

  getDefinition(): ManagedMcpDefinition {
    return this.definition;
  }

  setDefinition(definition: ManagedMcpDefinition): void {
    this.definition = definition;
    this.touch();
  }

  getStatus(): ManagedMcpStatus {
    return this.status;
  }

  getPid(): number | null {
    if (this.transport instanceof StdioClientTransport) {
      return this.transport.pid;
    }

    return null;
  }

  getLastError(): string | undefined {
    return this.lastError;
  }

  getUpdatedAt(): string {
    return this.updatedAt;
  }

  getTools(): UpstreamTool[] {
    return [...this.tools];
  }

  async start(): Promise<void> {
    if (this.startPromise) {
      return this.startPromise;
    }

    if (this.status === "ready") {
      return;
    }

    this.stopping = false;
    this.clearRestartTimer();

    this.startPromise = this.connect().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.clearRestartTimer();
    this.setStatus("stopping");
    this.log(
      "info",
      "manager",
      taggedMessage("runtime.lifecycle", "Stopping managed MCP."),
    );
    await this.disposeConnection();
    this.tools = [];
    this.lastError = undefined;
    this.setStatus("stopped");
  }

  async restart(): Promise<void> {
    await this.stop();
    if (this.definition.enabled) {
      await this.start();
    }
  }

  async callTool(
    upstreamName: string,
    args: Record<string, unknown> | undefined,
  ): Promise<CallToolResult> {
    await this.start();

    if (!this.client) {
      throw new Error(`Managed MCP "${this.definition.id}" is not connected.`);
    }

    const result = await this.client.callTool({
      name: upstreamName,
      arguments: args ?? {},
    });

    return result as CallToolResult;
  }

  private async connect(): Promise<void> {
    this.setStatus("starting");
    this.log(
      "info",
      "manager",
      taggedMessage(
        "runtime.lifecycle",
        `Starting ${this.definition.transport} MCP.`,
      ),
    );

    try {
      const client = new Client(
        {
          name: `all-in-one-mcp-${this.definition.id}`,
          version: "1.0.0",
        },
        {
          capabilities: {},
        },
      );

      const transport = this.createTransport();
      this.attachTransportListeners(transport);
      this.attachClientListeners(client);

      await this.withStartupTimeout(
        client.connect(transport),
        "connecting to the upstream server",
      );

      this.client = client;
      this.transport = transport;
      this.restartAttempt = 0;
      this.lastError = undefined;
      await this.withStartupTimeout(this.refreshTools(), "discovering tools");
      this.setStatus("ready");
      this.log(
        "info",
        "manager",
        taggedMessage("runtime.lifecycle", "Managed MCP is ready."),
      );
    } catch (error) {
      await this.handleFailure(error);
    }
  }

  private createTransport():
    | StdioClientTransport
    | StreamableHTTPClientTransport {
    if (this.definition.transport === "stdio") {
      const transport = new StdioClientTransport({
        command: this.definition.command,
        args: this.definition.args,
        cwd: this.definition.cwd,
        env: this.toRecord(this.definition.env),
        stderr: "pipe",
      });

      this.attachStderrStream(transport.stderr);
      return transport;
    }

    return new StreamableHTTPClientTransport(new URL(this.definition.url), {
      requestInit: {
        headers: this.toRecord(this.definition.headers),
      },
      reconnectionOptions: {
        initialReconnectionDelay: 1_000,
        maxReconnectionDelay: 30_000,
        maxRetries: 2,
        reconnectionDelayGrowFactor: 1.5,
      },
    });
  }

  private attachTransportListeners(
    transport: StdioClientTransport | StreamableHTTPClientTransport,
  ): void {
    transport.onerror = (error) => {
      if (!this.disposing && !this.stopping) {
        void this.handleFailure(error);
      }
    };

    transport.onclose = () => {
      if (!this.disposing && !this.stopping) {
        void this.handleFailure(
          new Error("Managed MCP connection closed unexpectedly."),
        );
      }
    };
  }

  private attachClientListeners(client: Client): void {
    client.onerror = (error) => {
      if (!this.disposing && !this.stopping) {
        void this.handleFailure(error);
      }
    };

    client.setNotificationHandler(
      LoggingMessageNotificationSchema,
      (notification) => {
        this.log(
          this.coerceLogLevel(notification.params.level),
          "upstream",
          typeof notification.params.data === "string"
            ? notification.params.data
            : JSON.stringify(notification.params.data),
        );
      },
    );

    client.setNotificationHandler(
      ToolListChangedNotificationSchema,
      async () => {
        await this.refreshTools();
      },
    );
  }

  private async refreshTools(): Promise<void> {
    if (!this.client) {
      this.tools = [];
      this.touch();
      return;
    }

    const result = await this.client.listTools();
    this.tools = result.tools.map((tool) => ({
      upstreamName: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputSchema: tool.outputSchema,
      annotations: tool.annotations,
      execution: tool.execution,
    }));
    this.touch();
    this.log(
      "debug",
      "manager",
      taggedMessage(
        "runtime.tools",
        `Tool catalog refreshed (${this.tools.length} tools).`,
      ),
    );
  }

  private attachStderrStream(stream: Stream | null): void {
    if (!stream) {
      return;
    }

    const lineBuffer = new LineBuffer((line) => {
      this.log("warn", "stderr", line);
    });

    stream.on("data", (chunk) => {
      lineBuffer.push(String(chunk));
    });
    stream.on("end", () => {
      lineBuffer.flush();
    });
  }

  private async handleFailure(error: unknown): Promise<void> {
    const message = normalizeError(error);
    this.lastError = message;
    this.log("error", "manager", taggedMessage("runtime.error", message));
    this.setStatus(this.status === "ready" ? "degraded" : "error");
    await this.disposeConnection();
    this.tools = [];
    this.touch();

    if (this.definition.enabled && !this.stopping) {
      this.scheduleRestart();
    }
  }

  private scheduleRestart(): void {
    this.clearRestartTimer();

    const delay = Math.min(1_000 * 2 ** this.restartAttempt, 30_000);
    this.restartAttempt += 1;

    this.log(
      "warn",
      "manager",
      taggedMessage(
        "runtime.retry",
        `Scheduling restart in ${delay}ms (attempt ${this.restartAttempt}).`,
      ),
    );
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      void this.start();
    }, delay);
  }

  private async disposeConnection(): Promise<void> {
    if (this.disposing) {
      return;
    }

    this.disposing = true;

    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;

    try {
      await client?.close();
    } catch {
      // Ignore close errors during cleanup.
    }

    try {
      await transport?.close();
    } catch {
      // Ignore close errors during cleanup.
    }

    this.disposing = false;
  }

  private setStatus(status: ManagedMcpStatus): void {
    const previousStatus = this.status;
    this.status = status;
    this.touch();

    if (previousStatus !== status) {
      this.log(
        "info",
        "manager",
        taggedMessage("runtime.state", `${previousStatus} -> ${status}`),
      );
    }
  }

  private touch(): void {
    this.updatedAt = isoNow();
    this.hooks.onStateChanged();
  }

  private log(
    level: ManagedMcpLogEntry["level"],
    source: ManagedMcpLogEntry["source"],
    message: string,
  ): void {
    this.hooks.onLog({
      mcpId: this.definition.id,
      level,
      source,
      message,
      timestamp: isoNow(),
    });
  }

  private clearRestartTimer(): void {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
  }

  private async withStartupTimeout<T>(
    promise: Promise<T>,
    action: string,
  ): Promise<T> {
    const timeoutMs = this.definition.startupTimeoutMs;

    return await new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timed out while ${action} after ${timeoutMs}ms.`));
      }, timeoutMs);

      void promise.then(
        (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        (error: unknown) => {
          clearTimeout(timeout);
          reject(error);
        },
      );
    });
  }

  private toRecord(entries: KeyValuePair[]): Record<string, string> {
    return Object.fromEntries(entries.map((entry) => [entry.key, entry.value]));
  }

  private coerceLogLevel(level: string): ManagedMcpLogEntry["level"] {
    if (
      level === "debug" ||
      level === "info" ||
      level === "warn" ||
      level === "error"
    ) {
      return level;
    }

    return "info";
  }
}
