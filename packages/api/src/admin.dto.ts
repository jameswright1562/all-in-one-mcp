import type {
  KeyValuePair,
  ManagedMcpCollection,
  ManagedMcpSnapshot,
  ManagedMcpStatus,
  ManagedStreamableHttpMcpDefinition,
  ManagedStdioMcpDefinition,
  ManagedTool,
} from "@all-in-one-mcp/contracts";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class AdminHealthDto {
  @ApiProperty({ type: String, enum: ["ok"] })
  status!: "ok";
}

export class KeyValuePairDto implements KeyValuePair {
  @ApiProperty({ type: String })
  key!: string;

  @ApiProperty({ type: String })
  value!: string;

  @ApiPropertyOptional({ type: Boolean })
  masked?: boolean;
}

export class ManagedStdioMcpDefinitionDto
  implements ManagedStdioMcpDefinition
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: Boolean })
  autoStart!: boolean;

  @ApiProperty({ type: String })
  toolPrefix!: string;

  @ApiProperty({ type: Number })
  startupTimeoutMs!: number;

  @ApiProperty({ type: String, enum: ["stdio"] })
  transport!: "stdio";

  @ApiProperty({ type: String })
  command!: string;

  @ApiProperty({ type: [String] })
  args!: string[];

  @ApiPropertyOptional({ type: String })
  cwd?: string;

  @ApiProperty({ type: () => [KeyValuePairDto] })
  env!: KeyValuePairDto[];
}

export class ManagedStreamableHttpMcpDefinitionDto
  implements ManagedStreamableHttpMcpDefinition
{
  @ApiProperty({ type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: Boolean })
  enabled!: boolean;

  @ApiProperty({ type: Boolean })
  autoStart!: boolean;

  @ApiProperty({ type: String })
  toolPrefix!: string;

  @ApiProperty({ type: Number })
  startupTimeoutMs!: number;

  @ApiProperty({ type: String, enum: ["streamable-http"] })
  transport!: "streamable-http";

  @ApiProperty({ type: String })
  url!: string;

  @ApiProperty({ type: () => [KeyValuePairDto] })
  headers!: KeyValuePairDto[];
}

export class ManagedToolDto implements ManagedTool {
  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  upstreamName!: string;

  @ApiPropertyOptional({ type: String })
  title?: string;

  @ApiPropertyOptional({ type: String })
  description?: string;

  @ApiProperty({ type: "object", additionalProperties: true })
  inputSchema!: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  outputSchema?: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  annotations?: Record<string, unknown>;

  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  execution?: Record<string, unknown>;
}

export class ManagedMcpSnapshotDto implements ManagedMcpSnapshot {
  @ApiProperty({
    type: "object",
    additionalProperties: false,
    oneOf: [
      { $ref: "#/components/schemas/ManagedStdioMcpDefinitionDto" },
      { $ref: "#/components/schemas/ManagedStreamableHttpMcpDefinitionDto" },
    ],
    discriminator: {
      propertyName: "transport",
      mapping: {
        stdio: "#/components/schemas/ManagedStdioMcpDefinitionDto",
        "streamable-http":
          "#/components/schemas/ManagedStreamableHttpMcpDefinitionDto",
      },
    },
  })
  definition!:
    | ManagedStdioMcpDefinitionDto
    | ManagedStreamableHttpMcpDefinitionDto;

  @ApiProperty({
    type: String,
    enum: ["stopped", "starting", "ready", "degraded", "error", "stopping"],
  })
  status!: ManagedMcpStatus;

  @ApiProperty({ type: () => [ManagedToolDto] })
  tools!: ManagedToolDto[];

  @ApiProperty({ type: Number })
  toolCount!: number;

  @ApiProperty({ type: Number, nullable: true })
  pid!: number | null;

  @ApiPropertyOptional({ type: String })
  lastError?: string;

  @ApiProperty({ type: String })
  updatedAt!: string;
}

export class ManagedMcpCollectionDto implements ManagedMcpCollection {
  @ApiProperty({ type: () => [ManagedMcpSnapshotDto] })
  items!: ManagedMcpSnapshotDto[];

  @ApiProperty({ type: String })
  generatedAt!: string;
}

export type ManagedMcpCollectionResponse = ManagedMcpCollection;
