import { Module } from "@nestjs/common";
import { AdminModule } from "./admin.module";
import { ManagedMcpRuntime } from "./services/runtime";

@Module({
  imports: [AdminModule, ManagedMcpRuntime],
})
export class AppModule {}
