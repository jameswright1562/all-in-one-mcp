import type { ManagedMcpRuntimeOptions } from "@all-in-one-mcp/shared";
import { ManagedMcpRuntime as BaseManagedMcpRuntime } from "@all-in-one-mcp/shared/runtime/managedMcpRuntime";
import { McpGateway } from "@all-in-one-mcp/shared/gateway";

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
    request: Request,
    parsedBody?: unknown,
  ): Promise<Response> {
    return this.gateway.handleRequest(request, parsedBody);
  }
}

export function createManagedMcpRuntime(
  options: ManagedMcpRuntimeOptions = {},
): ManagedMcpRuntime {
  return new ManagedMcpRuntime(options);
}
