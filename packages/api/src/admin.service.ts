import type { ManagedMcpCollection } from '@all-in-one-mcp/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { ManagedMcpRuntime } from './services/runtime.service';
import { MANAGED_MCP_RUNTIME } from './tokens';

@Injectable()
export class AdminService {
  private readonly runtime: ManagedMcpRuntime;

  constructor(@Inject(MANAGED_MCP_RUNTIME) runtime: ManagedMcpRuntime) {
    this.runtime = runtime;
  }

  listMcps(): ManagedMcpCollection {
    return this.runtime.listMcps();
  }

  readiness(): {
    status: 'ok' | 'degraded';
    checks: {
      supervisor: boolean;
      sqlite: boolean;
    };
  } {
    const ready = this.runtime.isReady();

    return {
      status: ready ? 'ok' : 'degraded',
      checks: {
        supervisor: ready,
        sqlite: ready,
      },
    };
  }
}
