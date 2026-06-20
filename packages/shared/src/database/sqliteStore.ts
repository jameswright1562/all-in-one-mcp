import { DatabaseSync } from "node:sqlite";
import {
  MAX_LOG_ENTRIES_PER_MCP,
  managedMcpDefinitionSchema,
  managedMcpLogEntrySchema,
  profileDefinitionSchema,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ProfileDefinition,
  type ProfileMcpEntry,
} from "@all-in-one-mcp/contracts";

type McpRow = {
  id: string;
  name: string;
  enabled: number;
  auto_start: number;
  tool_prefix: string;
  startup_timeout_ms: number;
  transport: ManagedMcpDefinition["transport"];
  payload_json: string;
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
  enabled: number;
  tools_json: string;
};

type ActiveProfileRow = {
  profile_id: string | null;
};

export class SqliteStore {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS managed_mcps (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        auto_start INTEGER NOT NULL,
        tool_prefix TEXT NOT NULL UNIQUE,
        startup_timeout_ms INTEGER NOT NULL,
        transport TEXT NOT NULL,
        payload_json TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mcp_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        enabled INTEGER NOT NULL DEFAULT 1,
        tools_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (profile_id, mcp_id)
      );

      CREATE TABLE IF NOT EXISTS active_profile (
        singleton INTEGER PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
        profile_id TEXT REFERENCES profiles(id) ON DELETE SET NULL
      );

      INSERT OR IGNORE INTO active_profile (singleton, profile_id) VALUES (1, NULL);
    `);
  }

  close(): void {
    this.database.close();
  }

  isHealthy(): boolean {
    const row = this.database.prepare("SELECT 1 AS ok").get() as
      | { ok: number }
      | undefined;

    return row?.ok === 1;
  }

  listDefinitions(): ManagedMcpDefinition[] {
    const statement = this.database.prepare(`
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

    return statement.all().map((row) => this.hydrateDefinition(row as McpRow));
  }

  writeDefinition(definition: ManagedMcpDefinition): void {
    const statement = this.database.prepare(`
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
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        enabled = excluded.enabled,
        auto_start = excluded.auto_start,
        tool_prefix = excluded.tool_prefix,
        startup_timeout_ms = excluded.startup_timeout_ms,
        transport = excluded.transport,
        payload_json = excluded.payload_json
    `);

    const payload = this.extractPayload(definition);
    statement.run(
      definition.id,
      definition.name,
      definition.enabled ? 1 : 0,
      definition.autoStart ? 1 : 0,
      definition.toolPrefix,
      definition.startupTimeoutMs,
      definition.transport,
      JSON.stringify(payload),
    );
  }

  deleteDefinition(id: string): void {
    this.database.prepare("DELETE FROM managed_mcps WHERE id = ?").run(id);
  }

  appendLog(entry: Omit<ManagedMcpLogEntry, "id">): ManagedMcpLogEntry {
    const result = this.database
      .prepare(
        `
        INSERT INTO mcp_logs (mcp_id, level, source, message, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        entry.mcpId,
        entry.level,
        entry.source,
        entry.message,
        entry.timestamp,
      );

    this.database
      .prepare(
        `
        DELETE FROM mcp_logs
        WHERE id IN (
          SELECT id
          FROM mcp_logs
          WHERE mcp_id = ?
          ORDER BY id DESC
          LIMIT -1 OFFSET ?
        )
      `,
      )
      .run(entry.mcpId, MAX_LOG_ENTRIES_PER_MCP);

    return managedMcpLogEntrySchema.parse({
      ...entry,
      id: Number(result.lastInsertRowid),
    });
  }

  listLogs(mcpId: string, limit = 200): ManagedMcpLogEntry[] {
    const rows = this.database
      .prepare(
        `
        SELECT id, mcp_id, level, source, message, timestamp
        FROM mcp_logs
        WHERE mcp_id = ?
        ORDER BY id DESC
        LIMIT ?
      `,
      )
      .all(mcpId, limit) as LogRow[];

    return rows.reverse().map((row) =>
      managedMcpLogEntrySchema.parse({
        id: row.id,
        mcpId: row.mcp_id,
        level: row.level,
        source: row.source,
        message: row.message,
        timestamp: row.timestamp,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  listProfiles(): ProfileDefinition[] {
    const rows = this.database
      .prepare(
        "SELECT id, name, description FROM profiles ORDER BY name COLLATE NOCASE ASC",
      )
      .all() as ProfileRow[];

    return rows.map((row) => this.hydrateProfile(row));
  }

  getProfile(id: string): ProfileDefinition | null {
    const row = this.database
      .prepare("SELECT id, name, description FROM profiles WHERE id = ?")
      .get(id) as ProfileRow | undefined;

    return row ? this.hydrateProfile(row) : null;
  }

  writeProfile(profile: ProfileDefinition): void {
    this.database.exec("BEGIN");

    try {
      this.database
        .prepare(
          `INSERT INTO profiles (id, name, description)
           VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = excluded.name,
             description = excluded.description`,
        )
        .run(profile.id, profile.name, profile.description);

      this.database
        .prepare("DELETE FROM profile_mcps WHERE profile_id = ?")
        .run(profile.id);

      const insertMcp = this.database.prepare(
        `INSERT INTO profile_mcps (profile_id, mcp_id, enabled, tools_json)
         VALUES (?, ?, ?, ?)`,
      );

      for (const entry of profile.mcps) {
        insertMcp.run(
          profile.id,
          entry.mcpId,
          entry.enabled ? 1 : 0,
          JSON.stringify(entry.tools),
        );
      }

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  deleteProfile(id: string): void {
    this.database.prepare("DELETE FROM profiles WHERE id = ?").run(id);
  }

  getActiveProfileId(): string | null {
    const row = this.database
      .prepare("SELECT profile_id FROM active_profile WHERE singleton = 1")
      .get() as ActiveProfileRow | undefined;

    return row?.profile_id ?? null;
  }

  setActiveProfileId(profileId: string | null): void {
    this.database
      .prepare("UPDATE active_profile SET profile_id = ? WHERE singleton = 1")
      .run(profileId);
  }

  private hydrateProfile(row: ProfileRow): ProfileDefinition {
    const mcpRows = this.database
      .prepare(
        "SELECT profile_id, mcp_id, enabled, tools_json FROM profile_mcps WHERE profile_id = ?",
      )
      .all(row.id) as ProfileMcpRow[];

    const mcps: ProfileMcpEntry[] = mcpRows.map((mcpRow) => ({
      mcpId: mcpRow.mcp_id,
      enabled: Boolean(mcpRow.enabled),
      tools: JSON.parse(mcpRow.tools_json) as string[],
    }));

    return profileDefinitionSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      mcps,
    });
  }

  private hydrateDefinition(row: McpRow): ManagedMcpDefinition {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>;

    return managedMcpDefinitionSchema.parse({
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      autoStart: Boolean(row.auto_start),
      toolPrefix: row.tool_prefix,
      startupTimeoutMs: row.startup_timeout_ms,
      transport: row.transport,
      ...payload,
    });
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
