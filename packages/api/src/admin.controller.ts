import { Controller, Get } from "@nestjs/common";
import {
  ApiExtraModels,
  ApiOkResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { AdminService } from "./admin.service";
import {
  AdminHealthDto,
  KeyValuePairDto,
  ManagedMcpCollectionDto,
  ManagedMcpSnapshotDto,
  ManagedStreamableHttpMcpDefinitionDto,
  ManagedStdioMcpDefinitionDto,
  ManagedToolDto,
  type ManagedMcpCollectionResponse,
} from "./admin.dto";

@Controller("admin")
@ApiExtraModels(
  AdminHealthDto,
  KeyValuePairDto,
  ManagedStdioMcpDefinitionDto,
  ManagedStreamableHttpMcpDefinitionDto,
  ManagedToolDto,
  ManagedMcpSnapshotDto,
  ManagedMcpCollectionDto,
)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("health")
  @ApiOkResponse({ type: AdminHealthDto })
  health(): AdminHealthDto {
    return { status: "ok" };
  }

  @Get()
  @ApiOkResponse({
    schema: {
      $ref: getSchemaPath(ManagedMcpCollectionDto),
    },
  })
  getMcps(): ManagedMcpCollectionResponse {
    return this.adminService.listMcps();
  }
}
