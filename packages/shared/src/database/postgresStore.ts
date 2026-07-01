import { Pool, type QueryResult } from "pg";
import {
  managedMcpDefinitionSchema,
  managedMcpLogEntrySchema,
  profileDefinitionSchema,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ProfileDefinition,
  type ProfileMcpEntry,
} from "@all-in-one-mcp/contracts";
import { IDatabase } from "./types.js";

type McpRow = {
  id: string;
  name: string;
  enabled: boolean;
  auto_start: boolean;
  tool_prefix: string;
  startup_timeout_ms: number;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  disabledTools?: string[];
  payload_json: string;
};

type LogRow = {
  id: number;
  mcp_id: string;
  level: string;
  source: string;
  message: string;
  timestamp: string;
};

type ProfileRow = {
  id: string;
  name: string;
  description: string;
};

type ProfileMcpRow = {
  profile_id: string;
  mcp_id: string;
  enabled: boolean;
  tools_json: string;
};

type ActiveProfileRow = {
  profile_id: string | null;
};

export class PostgresStore implements IDatabase {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.initializeSchema();
  }

  private async initializeSchema(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS managed_mcps (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          enabled BOOLEAN NOT NULL,
          auto_start BOOLEAN NOT NULL,
          tool_prefix TEXT NOT NULL UNIQUE,
          startup_timeout_ms INTEGER NOT NULL,
          transport TEXT NOT NULL,
          payload_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mcp_logs (
          id SERIAL PRIMARY KEY,
          mcp_id TEXT NOT NULL,
          level TEXT NOT NULL,
          source TEXT NOT NULL,
          message TEXT NOT NULL,
          timestamp TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_mcp_logs_mcp_id_id ON mcp_logs (mcp_id, id DESC);

        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS profile_mcps (
          profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          mcp_id TEXT NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          tools_json TEXT NOT NULL DEFAULT '[]',
          PRIMARY KEY (profile_id, mcp_id)
        );

        CREATE TABLE IF NOT EXISTS active_profile (
          singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
          profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL
        );

        INSERT INTO active_profile (singleton, profile_id)
        SELECT 1, NULL
        WHERE NOT EXISTS (SELECT 1 FROM active_profile);
      `);
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.pool.query("SELECT 1 AS ok");
      return result.rows[0].ok === 1;
    } catch {
      return false;
    }
  }

  async listDefinitions(): Promise<ManagedMcpDefinition[]> {
    const result = await this.pool.query(`
      SELECT
        id,
        name,
        enabled,
        auto_start,
        tool_prefix,
        startup_timeout_ms,
        transport,
        payload_json
      FROM managed_mcps
      ORDER BY name COLLATE NOCASE ASC
    `);

    return result.rows.map((row) => this.hydrateDefinition(row));
  }

  async getDefinition(id: string): Promise<ManagedMcpDefinition | null> {
    const result = await this.pool.query(
      `
      SELECT
        id,
        name,
        enabled,
        auto_start,
        tool_prefix,
        startup_timeout_ms,
        transport,
        payload_json
      FROM managed_mcps
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.hydrateDefinition(result.rows[0]);
  }

  async writeDefinition(definition: ManagedMcpDefinition): Promise<void> {
    const payload = this.extractPayload(definition);
    await this.pool.query(
      `
      INSERT INTO managed_mcps (
        id,
        name,
        enabled,
        auto_start,
        tool_prefix,
        startup_timeout_ms,
        transport,
        payload_json
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        enabled = EXCLUDED.enabled,
        auto_start = EXCLUDED.auto_start,
        tool_prefix = EXCLUDED.tool_prefix,
        startup_timeout_ms = EXCLUDED.startup_timeout_ms,
        transport = EXCLUDED.transport,
        payload_json = EXCLUDED.payload_json
      `,
      [
        definition.id,
        definition.name,
        definition.enabled,
        definition.autoStart,
        definition.toolPrefix,
        definition.startupTimeoutMs,
        definition.transport,
        JSON.stringify(payload),
      ]
    );
  }

  async deleteDefinition(id: string): Promise<void> {
    await this.pool.query("DELETE FROM managed_mcps WHERE id = $1", [id]);
  }

  async appendLog(
    entry: Omit<ManagedMcpLogEntry, "id">
  ): Promise<ManagedMcpLogEntry> {
    const result = await this.pool.query(
      `
      INSERT INTO mcp_logs (mcp_id, level, source, message, timestamp)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
      [entry.mcpId, entry.level, entry.source, entry.message, entry.timestamp]
    );

    // Clean up old logs if needed
    await this.pool.query(
      `
      DELETE FROM mcp_logs
      WHERE id IN (
        SELECT id
        FROM mcp_logs
        WHERE mcp_id = $1
        ORDER BY id DESC
        OFFSET $2
      )
      `,
      [entry.mcpId, Number(process.env.MAX_LOG_ENTRIES_PER_MCP ?? 1000)]
    );

    return {
      ...entry,
      id: result.rows[0].id,
    };
  }

  async listLogs(mcpId: string, limit = 200): Promise<ManagedMcpLogEntry[]> {
    const result = await this.pool.query(
      `
      SELECT id, mcp_id, level, source, message, timestamp
      FROM mcp_logs
      WHERE mcp_id = $1
      ORDER BY id DESC
      LIMIT $2
      `,
      [mcpId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      mcpId: row.mcp_id,
      level: row.level as any, // Type assertion for enum
      source: row.source as any, // Type assertion for enum
      message: row.message,
      timestamp: row.timestamp,
    }));
  }

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  async listProfiles(): Promise<ProfileDefinition[]> {
    const result = await this.pool.query(
      "SELECT id, name, description FROM profiles ORDER BY name COLLATE NOCASE ASC"
    );

    return result.rows.map((row) => this.hydrateProfile(row));
  }

  async getProfile(id: string): Promise<ProfileDefinition | null> {
    const result = await this.pool.query(
      "SELECT id, name, description FROM profiles WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.hydrateProfile(result.rows[0]);
  }

  async writeProfile(profile: ProfileDefinition): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `
        INSERT INTO profiles (id, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          description = EXCLUDED.description
        `,
        [profile.id, profile.name, profile.description]
      );

      await client.query("DELETE FROM profile_mcps WHERE profile_id = $1", [
        profile.id,
      ]);

      const insertMcpSql = `
        INSERT INTO profile_mcps (profile_id, mcp_id, enabled, tools_json)
        VALUES ($1, $2, $3, $4)
      `;

      for (const entry of profile.mcps) {
        await client.query(insertMcpSql, [
          profile.id,
          entry.mcpId,
          entry.enabled,
          JSON.stringify(entry.tools),
        ]);
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteProfile(id: string): Promise<void> {
    await this.pool.query("DELETE FROM profiles WHERE id = $1", [id]);
  }

  async getActiveProfileId(): Promise<string | null> {
    const result = await this.pool.query(
      "SELECT profile_id FROM active_profile WHERE singleton = 1"
    );
    return result.rows.length > 0 ? result.rows[0].profile_id : null;
  }

  async setActiveProfileId(profileId: string | null): Promise<void> {
    await this.pool.query(
      "UPDATE active_profile SET profile_id = $1 WHERE singleton = 1",
      [profileId]
    );
  }

  private hydrateProfile(row: ProfileRow): ProfileDefinition {
    // Note: In a real implementation, we would fetch the MCP associations
    // For simplicity, we're returning an empty MCPs array
    // A full implementation would join with the profile_mcps table
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      mcps: [],
    };
  }

  private hydrateDefinition(row: McpRow): ManagedMcpDefinition {
    // Parse the payload_json to reconstruct the transport-specific fields
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;

    // Base definition
    const base: any = {
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      autoStart: row.auto_start,
      toolPrefix: row.tool_prefix,
      startupTimeoutMs: row.startup_timeout_ms,
      transport: row.transport,
    };

    // Add transport-specific fields
    if (row.transport === "stdio") {
      return {
        ...base,
        command: row.command as string | undefined,
        args: (row.args as string[]) ?? [],
        cwd: row.cwd as string | undefined,
        env: (row.env as Record<string, string>) ?? {},
        disabledTokens: (row.disabledTools as string[]) ?? [],
      };
    } else {
      // streamable-http
      return {
        ...base,
        url: row.url as string,
        headers: (row.headers as Record<string, string>) ?? {},
        disabledTools: (row.disabledTools as string[]) ?? [],
      };
    }
  }

  private extractPayload(
    definition: ManagedMcpDefinition,
  ): Record<string, unknown> {
    if (definition.transport === "stdio") {
      return {
        command: definition.command,
        args: definition.args,
        cwd: definition.cwd,
        env: definition.env,
        disabledTools: definition.disabledTools,
      };
    }

    return {
      url: definition.url,
      headers: definition.headers,
      disabledTools: definition.disabledTools,
    };
  }
}