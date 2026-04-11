import { randomUUID } from "node:crypto";
import {
  isInitializeRequest,
  type ListToolsResult,
  McpServer,
  type JSONRPCMessage,
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/server";
import type { ManagedMcpRuntime } from "../services/runtime";

type GatewaySession = {
  server: McpServer;
  transport: WebStandardStreamableHTTPServerTransport;
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

  constructor(private readonly runtime: ManagedMcpRuntime) {
    this.unsubscribe = this.runtime.subscribe((event) => {
      if (event.type === "snapshot" || event.type === "removed") {
        for (const session of this.sessions.values()) {
          session.server.sendToolListChanged();
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

    return session.transport.handleRequest(request, { parsedBody });
  }

  private async createSession(): Promise<GatewaySession> {
    const server = new McpServer(
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

    server.server.setRequestHandler("tools/list", async () => {
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

    server.server.setRequestHandler("tools/call", async (request) =>
      this.runtime.callTool(
        request.params.name,
        request.params.arguments as Record<string, unknown> | undefined,
      ),
    );

    const transport = new WebStandardStreamableHTTPServerTransport({
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
