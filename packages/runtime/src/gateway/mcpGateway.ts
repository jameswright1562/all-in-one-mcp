import { randomUUID } from "node:crypto";
import { type IncomingMessage, type ServerResponse } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  isInitializeRequest,
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type JSONRPCMessage,
} from "@modelcontextprotocol/sdk/types.js";
import type { ManagedMcpRuntime } from "../runtime.js";

type GatewaySession = {
  server: Server;
  transport: StreamableHTTPServerTransport;
};

export class McpGateway {
  private readonly sessions = new Map<string, GatewaySession>();
  private readonly unsubscribe: () => void;

  constructor(private readonly runtime: ManagedMcpRuntime) {
    this.unsubscribe = this.runtime.subscribe((event) => {
      if (event.type === "snapshot" || event.type === "removed") {
        for (const session of this.sessions.values()) {
          void session.server.sendToolListChanged().catch(() => {
            // Ignore closed-session notification failures.
          });
        }
      }
    });
  }

  async close(): Promise<void> {
    this.unsubscribe();

    for (const [sessionId, session] of this.sessions.entries()) {
      this.sessions.delete(sessionId);
      await session.transport.close().catch(() => {
        // Ignore shutdown races.
      });
      await session.server.close().catch(() => {
        // Ignore shutdown races.
      });
    }
  }

  async handleNodeRequest(
    req: IncomingMessage,
    res: ServerResponse,
    parsedBody?: unknown,
  ): Promise<void> {
    const sessionIdHeader = req.headers["mcp-session-id"];
    const sessionId = Array.isArray(sessionIdHeader)
      ? sessionIdHeader[0]
      : sessionIdHeader;

    if (
      !sessionId &&
      req.method === "POST" &&
      isInitializeRequest(parsedBody as JSONRPCMessage)
    ) {
      const session = await this.createSession();
      await session.transport.handleRequest(req, res, parsedBody);
      return;
    }

    if (!sessionId) {
      this.writeBadRequest(res, "Missing MCP session ID.");
      return;
    }

    const session = this.sessions.get(sessionId);
    if (!session) {
      this.writeBadRequest(res, "Unknown MCP session ID.");
      return;
    }

    await session.transport.handleRequest(req, res, parsedBody);
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
      return {
        tools: this.runtime.getExposedTools().map((tool) => ({
          name: tool.name,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
          annotations: tool.annotations,
          execution: tool.execution,
        })),
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return this.runtime.callTool(
        request.params.name,
        request.params.arguments as Record<string, unknown> | undefined,
      );
    });

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId) => {
        this.sessions.set(sessionId, { server, transport });
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        this.sessions.delete(transport.sessionId);
      }
    };

    await server.connect(transport);

    return { server, transport };
  }

  private writeBadRequest(res: ServerResponse, message: string): void {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message,
        },
        id: null,
      }),
    );
  }
}
