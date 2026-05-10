import {
  managedMcpCollectionSchema,
  managedMcpSnapshotSchema,
} from '@all-in-one-mcp/contracts';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const adminHealthSchema = z.object({
  status: z.literal('ok'),
});

const adminReadinessSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  checks: z.object({
    supervisor: z.boolean(),
    sqlite: z.boolean(),
  }),
});

export class AdminHealthDto extends createZodDto(adminHealthSchema) {}
export class AdminReadinessDto extends createZodDto(adminReadinessSchema) {}
export class ManagedMcpSnapshotDto extends createZodDto(
  managedMcpSnapshotSchema,
) {}
export class ManagedMcpCollectionDto extends createZodDto(
  managedMcpCollectionSchema,
) {}
