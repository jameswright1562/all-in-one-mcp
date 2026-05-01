import type { ManagedMcpRuntimeOptions } from "@all-in-one-mcp/shared";
import { ManagedMcpRuntime as BaseManagedMcpRuntime } from "@all-in-one-mcp/shared/runtime/managedMcpRuntime";
import { McpGateway } from "./gateway/mcpGateway.js";

export class ManagedMcpRuntime extends BaseManagedMcpRuntime {
  private readonly gateway: McpGateway;

  constructor(options: ManagedMcpRuntimeOptions = {}) {
    super(options);
    this.gateway = new McpGateway(this);
  }

  async close(): Promise<void> {
    await this.gateway.close();
    await super.close();
  }

  async handleGatewayHttpRequest(
    req: Parameters<McpGateway["handleNodeRequest"]>[0],
    res: Parameters<McpGateway["handleNodeRequest"]>[1],
    parsedBody?: unknown,
  ): Promise<void> {
    await this.gateway.handleNodeRequest(req, res, parsedBody);
  }
}

export function createManagedMcpRuntime(
  options: ManagedMcpRuntimeOptions = {},
): ManagedMcpRuntime {
  return new ManagedMcpRuntime(options);
}
