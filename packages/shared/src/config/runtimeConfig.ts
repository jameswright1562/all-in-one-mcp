import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { type IDatabase } from "../database/types.js";
import { SqliteStore } from "../database/sqliteStore.js";
import { PostgresStore } from "../database/postgresStore.js";
import { SupabaseStore } from "../database/supabaseStore.js";

export type DatabaseType = "sqlite" | "postgres" | "supabase";

export type SqliteDatabaseConfig = {
  type: "sqlite";
  path?: string;
};

export type PostgresDatabaseConfig = {
  type: "postgres";
  connectionString: string;
};

export type SupabaseDatabaseConfig = {
  type: "supabase";
  url: string;
  key: string;
};

export type DatabaseConfig = SqliteDatabaseConfig | PostgresDatabaseConfig | SupabaseDatabaseConfig;

export type ManagedMcpRuntimeOptions = {
  database?: IDatabase;
  databaseConfig?: DatabaseConfig;
};

export function resolveDefaultDataDirectory(): string {
  const override = process.env.ALL_IN_ONE_MCP_HOME?.trim();
  if (override) {
    const resolvedOverride = resolve(override);
    mkdirSync(resolvedOverride, { recursive: true });
    return resolvedOverride;
  }

  let baseDirectory: string;

  if (process.platform === "win32" && process.env.LOCALAPPDATA?.trim()) {
    baseDirectory = resolve(process.env.LOCALAPPDATA.trim(), "all-in-one-mcp");
  } else if (process.platform === "darwin") {
    baseDirectory = resolve(
      homedir(),
      "Library",
      "Application Support",
      "all-in-one-mcp",
    );
  } else if (process.env.XDG_DATA_HOME?.trim()) {
    baseDirectory = resolve(process.env.XDG_DATA_HOME.trim(), "all-in-one-mcp");
  } else {
    baseDirectory = resolve(homedir(), ".local", "share", "all-in-one-mcp");
  }

  mkdirSync(baseDirectory, { recursive: true });
  return baseDirectory;
}

export function resolveDatabasePath(databasePath?: string): string {
  const resolvedPath =
    databasePath && databasePath.trim().length > 0
      ? resolve(databasePath)
      : join(resolveDefaultDataDirectory(), "all-in-one-mcp.sqlite");

  mkdirSync(dirname(resolvedPath), { recursive: true });
  return resolvedPath;
}

export function createDatabaseFromConfig(config: DatabaseConfig): IDatabase {
  switch (config.type) {
    case "sqlite":
      return new SqliteStore(
        config.path ?? resolveDefaultDataDirectory() + "/all-in-one-mcp.sqlite"
      );
    case "postgres":
      return new PostgresStore(config.connectionString);
    case "supabase":
      return new SupabaseStore(config.url, config.key);
    default:
      throw new Error(`Unsupported database type: ${(config as any).type}`);
  }
}