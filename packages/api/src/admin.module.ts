import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { ManagedMcpRuntime } from "./services/runtime.service";
import { MANAGED_MCP_RUNTIME } from "./tokens";

@Module({
  controllers: [AdminController],
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
