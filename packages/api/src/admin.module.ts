import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { HealthController } from './health.controller';
import { ManagedMcpRuntime } from './services/runtime.service';
import { MANAGED_MCP_RUNTIME } from './tokens';

@Module({
  controllers: [AdminController, HealthController],
  providers: [
    AdminService,
    ManagedMcpRuntime,
    {
      provide: MANAGED_MCP_RUNTIME,
      useExisting: ManagedMcpRuntime,
    },
  ],
  exports: [AdminService, ManagedMcpRuntime],
})
export class AdminModule {}
