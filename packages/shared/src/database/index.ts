export * from "./sqliteStore.js";
export * from "./postgresStore.js";
export * from "./supabaseStore.js";
export * from "./types.js";

import { SqliteStore } from "./sqliteStore.js";
import { PostgresStore } from "./postgresStore.js";
import { SupabaseStore } from "./supabaseStore.js";

/**
 * Create a database instance based on the provided configuration.
 * @param config - Database configuration
 * @returns A database instance implementing the IDatabase interface
 */
export function createDatabase(
  config:
    | { type: "sqlite"; path?: string }
    | { type: "postgres"; connectionString: string }
    | { type: "supabase"; url: string; key: string }
): import("./types.js").IDatabase {
  if (config.type === "sqlite") {
    return new SqliteStore(config.path ?? "./data.db");
  } else if (config.type === "postgres") {
    return new PostgresStore(config.connectionString);
  } else if (config.type === "supabase") {
    return new SupabaseStore(config.url, config.key);
  } else {
    throw new Error(`Unsupported database type: ${(config as any).type}`);
  }
}

/**
 * Create a database instance from environment variables.
 * Supports:
 * - DATABASE_URL (for PostgreSQL)
 * - SUPABASE_URL and SUPABASE_KEY (for Supabase)
 * - DB_TYPE (sqlite, postgres, or supabase, defaults to sqlite)
 * - DB_PATH (for SQLite, defaults to a local file)
 */
export function createDatabaseFromEnv(): import("./types.js").IDatabase {
  const dbType = process.env.DB_TYPE?.toLowerCase() ?? "sqlite";
  
  if (dbType === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required for PostgreSQL");
    }
    return new PostgresStore(connectionString);
  } else if (dbType === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_KEY environment variables are required for Supabase");
    }
    return new SupabaseStore(url, key);
  } else {
    // Default to SQLite
    const dbPath = process.env.DB_PATH ?? "./data.db";
    return new SqliteStore(dbPath);
  }
}