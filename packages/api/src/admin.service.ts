import type { ManagedMcpCollection } from "@all-in-one-mcp/contracts";
import { Inject, Injectable } from "@nestjs/common";
import type { ManagedMcpRuntime } from "./services/runtime";
import { MANAGED_MCP_RUNTIME } from "./tokens";

@Injectable()
export class AdminService {
  constructor(
    @Inject(MANAGED_MCP_RUNTIME) private readonly runtime: ManagedMcpRuntime,
  ) {}

  listMcps(): ManagedMcpCollection {
    return this.runtime.listMcps();
  }
}
