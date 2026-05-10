import { describe, expect, it } from "vitest";
import { McpGateway } from "../../src/gateway/mcpGateway.js";

function createGateway() {
  const runtime = {
    subscribe() {
      return () => undefined;
    },
    getExposedTools() {
      return [];
    },
    async callTool() {
      return {
        content: [],
      };
    },
  };

  return new McpGateway(runtime as never);
}

describe("McpGateway", () => {
  it("rejects requests without a session id", async () => {
    const gateway = createGateway();

    const response = await gateway.handleRequest(
      new Request("http://127.0.0.1:4100/mcp", {
        method: "GET",
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: {
        message: "Missing MCP session ID.",
      },
    });

    await gateway.close();
  });
});
