import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  CallToolRequestSchema,
  isInitializeRequest,
  ListToolsRequestSchema,
  type JSONRPCMessage,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import type { ManagedMcpRuntime } from "../runtime/managedMcpRuntime.js";

type GatewaySession = {
  server: Server;
  transport: WebStandardStreamableHTTPServerTransport;
  timeout?: NodeJS.Timeout;
};

type McpGatewayOptions = {
  sessionIdleTimeoutMs?: number;
  maxSessions?: number;
};

type ObjectSchema = {
  type: "object";
  [key: string]: unknown;
};

function ensureObjectSchema(
  schema: Record<string, unknown> | undefined,
): ObjectSchema {
  return {
    ...(schema ?? {}),
    type: "object",
  } as ObjectSchema;
}

export class McpGateway {
  private readonly sessions = new Map<string, GatewaySession>();
  private readonly unsubscribe: () => void;
  private readonly sessionIdleTimeoutMs: number;
  private readonly maxSessions: number;

  constructor(
    private readonly runtime: ManagedMcpRuntime,
    options: McpGatewayOptions = {},
  ) {
    this.sessionIdleTimeoutMs = options.sessionIdleTimeoutMs ?? 15 * 60_000;
    this.maxSessions = options.maxSessions ?? 100;
    this.unsubscribe = this.runtime.subscribe((event) => {
      if (event.type === "snapshot" || event.type === "removed") {
        for (const session of this.sessions.values()) {
          void session.server.sendToolListChanged().catch(() => {
            // Ignore notification failures for closing sessions.
          });
        }
      }
    });
  }

  async close(): Promise<void> {
    this.unsubscribe();

    for (const sessionId of [...this.sessions.keys()]) {
      await this.closeSession(sessionId);
    }
  }

  async handleRequest(
    request: Request,
    parsedBody?: unknown,
  ): Promise<Response> {
    const sessionId = request.headers.get("mcp-session-id");

    if (
      !sessionId &&
      request.method === "POST" &&
      isInitializeRequest(parsedBody as JSONRPCMessage)
    ) {
      const session = await this.createSession();
      return session.transport.handleRequest(request, { parsedBody });
    }

    if (!sessionId) {
      return this.writeBadRequest("Missing MCP session ID.");
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      return this.writeBadRequest("Unknown MCP session ID.");
    }

    this.refreshSession(sessionId, session);

    return session.transport.handleRequest(request, { parsedBody });
  }

  private async createSession(): Promise<GatewaySession> {
    const server = new Server(
      {
        name: "all-in-one-mcp",
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

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.runtime.getExposedTools().map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: ensureObjectSchema(tool.inputSchema),
        outputSchema: tool.outputSchema
          ? ensureObjectSchema(tool.outputSchema)
          : undefined,
        annotations: tool.annotations,
        execution: tool.execution,
      })) as ListToolsResult["tools"];

      return { tools };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) =>
      this.runtime.callTool(
        request.params.name,
        request.params.arguments as Record<string, unknown> | undefined,
      ),
    );

    if (this.sessions.size >= this.maxSessions) {
      throw new Error("Too many active MCP gateway sessions.");
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (nextSessionId) => {
        const session: GatewaySession = {
          server,
          transport,
          timeout: setTimeout(() => {
            void this.closeSession(nextSessionId);
          }, this.sessionIdleTimeoutMs),
        };
        this.sessions.set(nextSessionId, session);
      },
      onsessionclosed: (nextSessionId) => {
        void this.closeSession(nextSessionId);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        void this.closeSession(transport.sessionId);
      }
    };

    await server.connect(transport);

    return { server, transport };
  }

  private refreshSession(sessionId: string, session: GatewaySession): void {
    if (session.timeout) {
      clearTimeout(session.timeout);
    }
    session.timeout = setTimeout(() => {
      void this.closeSession(sessionId);
    }, this.sessionIdleTimeoutMs);
  }

  private async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    this.sessions.delete(sessionId);
    if (session.timeout) {
      clearTimeout(session.timeout);
    }
    await session.transport.close().catch(() => {
      // Ignore shutdown races.
    });
    await session.server.close().catch(() => {
      // Ignore shutdown races.
    });
  }

  private writeBadRequest(message: string): Response {
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message,
        },
        id: null,
      }),
      {
        status: 400,
        headers: {
          "content-type": "application/json",
        },
      },
    );
  }
}
