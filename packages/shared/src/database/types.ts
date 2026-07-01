import {
  managedMcpDefinitionSchema,
  managedMcpLogEntrySchema,
  profileDefinitionSchema,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ProfileDefinition,
  type ProfileMcpEntry,
} from "@all-in-one-mcp/contracts";

/**
 * Database configuration for different database types.
 */
export interface DatabaseConfig {
  type: "sqlite" | "postgres";
  /** SQLite-specific configuration */
  sqlite?: {
    /** Path to the SQLite database file */
    databasePath: string;
  };
  /** PostgreSQL-specific configuration */
  postgres?: {
    /** PostgreSQL connection string */
    connectionString: string;
  };
}

/**
 * Database interface for MCP manager storage.
 * This abstraction allows swapping between different database implementations
 * (SQLite, PostgreSQL, etc.) while maintaining the same API.
 */
export interface IDatabase {
  // MCP Definition Methods
  listDefinitions(): Promise<ManagedMcpDefinition[]>;
  getDefinition(id: string): Promise<ManagedMcpDefinition | null>;
  writeDefinition(definition: ManagedMcpDefinition): Promise<void>;
  deleteDefinition(id: string): Promise<void>;

  // MCP Log Methods
  appendLog(entry: Omit<ManagedMcpLogEntry, "id">): Promise<ManagedMcpLogEntry>;
  listLogs(mcpId: string, limit?: number): Promise<ManagedMcpLogEntry[]>;

  // Profile Methods
  listProfiles(): Promise<ProfileDefinition[]>;
  getProfile(id: string): Promise<ProfileDefinition | null>;
  writeProfile(profile: ProfileDefinition): Promise<void>;
  deleteProfile(id: string): Promise<void>;

  // Active Profile Methods
  getActiveProfileId(): Promise<string | null>;
  setActiveProfileId(profileId: string | null): Promise<void>;

  // Health Check
  isHealthy(): Promise<boolean>;

  // Connection Management
  close(): Promise<void>;
}

// Re-export types for convenience
export type {
  ManagedMcpDefinition,
  ManagedMcpLogEntry,
  ProfileDefinition,
  ProfileMcpEntry,
};