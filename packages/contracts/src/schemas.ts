import { z } from "zod";
import { DEFAULT_STARTUP_TIMEOUT_MS } from "./constants.js";

const identifierSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^[a-z0-9]+(?:[-_][a-z0-9]+)*$/i,
    "Use letters, numbers, dashes, or underscores.",
  );

const jsonObjectSchema = z.record(z.string(), z.unknown());

export const keyValuePairSchema = z.object({
  key: z.string().trim().min(1),
  value: z.string(),
  masked: z.boolean().optional(),
});

const managedMcpBaseSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  autoStart: z.boolean().default(true),
  toolPrefix: identifierSchema,
  startupTimeoutMs: z
    .number()
    .int()
    .min(1)
    .max(120_000)
    .default(DEFAULT_STARTUP_TIMEOUT_MS),
});

export const managedStdioMcpDefinitionSchema = managedMcpBaseSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().trim().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().trim().min(1).optional(),
  env: z.array(keyValuePairSchema).default([]),
});

export const managedStreamableHttpMcpDefinitionSchema =
  managedMcpBaseSchema.extend({
    transport: z.literal("streamable-http"),
    url: z.string().url(),
    headers: z.array(keyValuePairSchema).default([]),
  });

export const managedMcpDefinitionSchema = z.discriminatedUnion("transport", [
  managedStdioMcpDefinitionSchema,
  managedStreamableHttpMcpDefinitionSchema,
]);

export const managedMcpStatusSchema = z.enum([
  "stopped",
  "starting",
  "ready",
  "degraded",
  "error",
  "stopping",
]);

export const managedToolSchema = z.object({
  name: z.string(),
  upstreamName: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: jsonObjectSchema,
  outputSchema: jsonObjectSchema.optional(),
  annotations: jsonObjectSchema.optional(),
  execution: jsonObjectSchema.optional(),
});

export const managedMcpSnapshotSchema = z.object({
  definition: managedMcpDefinitionSchema,
  status: managedMcpStatusSchema,
  tools: z.array(managedToolSchema),
  toolCount: z.number().int().min(0),
  pid: z.number().int().nullable(),
  lastError: z.string().optional(),
  updatedAt: z.string(),
});

export const managedMcpLogLevelSchema = z.enum([
  "debug",
  "info",
  "warn",
  "error",
]);
export const managedMcpLogSourceSchema = z.enum([
  "manager",
  "stdout",
  "stderr",
  "transport",
  "upstream",
]);

export const managedMcpLogEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  mcpId: z.string(),
  level: managedMcpLogLevelSchema,
  source: managedMcpLogSourceSchema,
  message: z.string(),
  timestamp: z.string(),
});

export const managedMcpEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("snapshot"),
    snapshot: managedMcpSnapshotSchema,
  }),
  z.object({
    type: z.literal("log"),
    entry: managedMcpLogEntrySchema,
  }),
  z.object({
    type: z.literal("removed"),
    mcpId: z.string(),
  }),
]);

export const managedMcpCollectionSchema = z.object({
  items: z.array(managedMcpSnapshotSchema),
  generatedAt: z.string(),
});

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

export const profileMcpEntrySchema = z.object({
  mcpId: z.string().trim().min(1),
  enabled: z.boolean().default(true),
  tools: z
    .array(z.string().trim().min(1))
    .default([])
    .describe(
      "Upstream tool names to expose. An empty array means all tools are exposed.",
    ),
});

export const profileDefinitionSchema = z.object({
  id: identifierSchema,
  name: z.string().trim().min(1),
  description: z.string().default(""),
  mcps: z.array(profileMcpEntrySchema).default([]),
});

export const profileCollectionSchema = z.object({
  items: z.array(profileDefinitionSchema),
  activeProfileId: z.string().nullable(),
  generatedAt: z.string(),
});

export const profileEventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("profile-snapshot"),
    profile: profileDefinitionSchema,
  }),
  z.object({
    type: z.literal("profile-removed"),
    profileId: z.string(),
  }),
  z.object({
    type: z.literal("profile-activated"),
    profileId: z.string().nullable(),
  }),
]);

export type KeyValuePair = z.infer<typeof keyValuePairSchema>;
export type ManagedMcpDefinition = z.infer<typeof managedMcpDefinitionSchema>;
export type ManagedStdioMcpDefinition = z.infer<
  typeof managedStdioMcpDefinitionSchema
>;
export type ManagedStreamableHttpMcpDefinition = z.infer<
  typeof managedStreamableHttpMcpDefinitionSchema
>;
export type ManagedMcpStatus = z.infer<typeof managedMcpStatusSchema>;
export type ManagedTool = z.infer<typeof managedToolSchema>;
export type ManagedMcpSnapshot = z.infer<typeof managedMcpSnapshotSchema>;
export type ManagedMcpLogEntry = z.infer<typeof managedMcpLogEntrySchema>;
export type ManagedMcpEvent = z.infer<typeof managedMcpEventSchema>;
export type ManagedMcpCollection = z.infer<typeof managedMcpCollectionSchema>;
export type ProfileMcpEntry = z.infer<typeof profileMcpEntrySchema>;
export type ProfileDefinition = z.infer<typeof profileDefinitionSchema>;
export type ProfileCollection = z.infer<typeof profileCollectionSchema>;
export type ProfileEvent = z.infer<typeof profileEventSchema>;
