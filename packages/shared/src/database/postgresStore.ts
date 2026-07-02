import { Pool } from "pg";
import {
  MAX_LOG_ENTRIES_PER_MCP,
  managedMcpLogEntrySchema,
  profileDefinitionSchema,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ProfileDefinition,
  type ProfileMcpEntry,
} from "@all-in-one-mcp/contracts";
import type { IDatabase } from "./types.js";

type McpRow = {
  id: string;
  name: string;
  enabled: boolean;
  auto_start: boolean;
  tool_prefix: string;
  startup_timeout_ms: number;
  transport: ManagedMcpDefinition["transport"];
  payload_json: Record<string, unknown> | string;
};

type LogRow = {
  id: number;
  mcp_id: string;
  level: ManagedMcpLogEntry["level"];
  source: ManagedMcpLogEntry["source"];
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
  tools_json: string[] | string;
};

type ActiveProfileRow = {
  profile_id: string | null;
};

function parseJsonValue<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export class PostgresStore implements IDatabase {
  private readonly pool: Pool;
  private readonly ready: Promise<void>;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
    this.ready = this.initializeSchema();
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
          payload_json JSONB NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mcp_logs (
          id BIGSERIAL PRIMARY KEY,
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
          tools_json JSONB NOT NULL DEFAULT '[]'::jsonb,
          PRIMARY KEY (profile_id, mcp_id)
        );

        CREATE TABLE IF NOT EXISTS active_profile (
          singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
          profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL
        );

        INSERT INTO active_profile (singleton, profile_id)
        SELECT 1, NULL
        WHERE NOT EXISTS (SELECT 1 FROM active_profile WHERE singleton = 1);
      `);
    } finally {
      client.release();
    }
  }

  private async ensureReady(): Promise<void> {
    await this.ready;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async isHealthy(): Promise<boolean> {
    await this.ensureReady();

    try {
      const result = await this.pool.query<{ ok: number }>("SELECT 1 AS ok");
      return result.rows[0]?.ok === 1;
    } catch {
      return false;
    }
  }

  async listDefinitions(): Promise<ManagedMcpDefinition[]> {
    await this.ensureReady();

    const result = await this.pool.query<McpRow>(`
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
      ORDER BY LOWER(name), name
    `);

    return result.rows.map((row) => this.hydrateDefinition(row));
  }

  async getDefinition(id: string): Promise<ManagedMcpDefinition | null> {
    await this.ensureReady();

    const result = await this.pool.query<McpRow>(
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
      [id],
    );

    return result.rows[0] ? this.hydrateDefinition(result.rows[0]) : null;
  }

  async writeDefinition(definition: ManagedMcpDefinition): Promise<void> {
    await this.ensureReady();

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
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
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
      ],
    );
  }

  async deleteDefinition(id: string): Promise<void> {
    await this.ensureReady();
    await this.pool.query("DELETE FROM managed_mcps WHERE id = $1", [id]);
  }

  async appendLog(
    entry: Omit<ManagedMcpLogEntry, "id">,
  ): Promise<ManagedMcpLogEntry> {
    await this.ensureReady();

    const result = await this.pool.query<{ id: string }>(
      `
        INSERT INTO mcp_logs (mcp_id, level, source, message, timestamp)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `,
      [entry.mcpId, entry.level, entry.source, entry.message, entry.timestamp],
    );

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
      [entry.mcpId, MAX_LOG_ENTRIES_PER_MCP],
    );

    return managedMcpLogEntrySchema.parse({
      ...entry,
      id: Number(result.rows[0]?.id ?? 0),
    });
  }

  async listLogs(mcpId: string, limit = 200): Promise<ManagedMcpLogEntry[]> {
    await this.ensureReady();

    const result = await this.pool.query<LogRow>(
      `
        SELECT id, mcp_id, level, source, message, timestamp
        FROM mcp_logs
        WHERE mcp_id = $1
        ORDER BY id DESC
        LIMIT $2
      `,
      [mcpId, limit],
    );

    return result.rows
      .reverse()
      .map((row) =>
        managedMcpLogEntrySchema.parse({
          id: Number(row.id),
          mcpId: row.mcp_id,
          level: row.level,
          source: row.source,
          message: row.message,
          timestamp: row.timestamp,
        }),
      );
  }

  async listProfiles(): Promise<ProfileDefinition[]> {
    await this.ensureReady();

    const result = await this.pool.query<ProfileRow>(
      "SELECT id, name, description FROM profiles ORDER BY LOWER(name), name",
    );

    return Promise.all(result.rows.map((row) => this.hydrateProfile(row)));
  }

  async getProfile(id: string): Promise<ProfileDefinition | null> {
    await this.ensureReady();

    const result = await this.pool.query<ProfileRow>(
      "SELECT id, name, description FROM profiles WHERE id = $1",
      [id],
    );

    return result.rows[0] ? this.hydrateProfile(result.rows[0]) : null;
  }

  async writeProfile(profile: ProfileDefinition): Promise<void> {
    await this.ensureReady();

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
        [profile.id, profile.name, profile.description],
      );

      await client.query("DELETE FROM profile_mcps WHERE profile_id = $1", [
        profile.id,
      ]);

      for (const entry of profile.mcps) {
        await client.query(
          `
            INSERT INTO profile_mcps (profile_id, mcp_id, enabled, tools_json)
            VALUES ($1, $2, $3, $4::jsonb)
          `,
          [profile.id, entry.mcpId, entry.enabled, JSON.stringify(entry.tools)],
        );
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
    await this.ensureReady();
    await this.pool.query("DELETE FROM profiles WHERE id = $1", [id]);
  }

  async getActiveProfileId(): Promise<string | null> {
    await this.ensureReady();

    const result = await this.pool.query<ActiveProfileRow>(
      "SELECT profile_id FROM active_profile WHERE singleton = 1",
    );
    return result.rows[0]?.profile_id ?? null;
  }

  async setActiveProfileId(profileId: string | null): Promise<void> {
    await this.ensureReady();

    await this.pool.query(
      `
        INSERT INTO active_profile (singleton, profile_id)
        VALUES (1, $1)
        ON CONFLICT (singleton) DO UPDATE SET profile_id = EXCLUDED.profile_id
      `,
      [profileId],
    );
  }

  private async hydrateProfile(row: ProfileRow): Promise<ProfileDefinition> {
    const result = await this.pool.query<ProfileMcpRow>(
      `
        SELECT profile_id, mcp_id, enabled, tools_json
        FROM profile_mcps
        WHERE profile_id = $1
      `,
      [row.id],
    );

    const mcps: ProfileMcpEntry[] = result.rows.map((mcpRow) => ({
      mcpId: mcpRow.mcp_id,
      enabled: Boolean(mcpRow.enabled),
      tools: parseJsonValue<string[]>(mcpRow.tools_json),
    }));

    return profileDefinitionSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      mcps,
    });
  }

  private hydrateDefinition(row: McpRow): ManagedMcpDefinition {
    const payload = parseJsonValue<Record<string, unknown>>(row.payload_json);

    return {
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      autoStart: Boolean(row.auto_start),
      toolPrefix: row.tool_prefix,
      startupTimeoutMs: row.startup_timeout_ms,
      transport: row.transport,
      ...payload,
    } as ManagedMcpDefinition;
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