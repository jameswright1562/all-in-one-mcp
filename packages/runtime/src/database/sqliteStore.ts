import { DatabaseSync } from 'node:sqlite'
import {
  MAX_LOG_ENTRIES_PER_MCP,
  managedMcpDefinitionSchema,
  managedMcpLogEntrySchema,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry
} from '@all-in-one-mcp/contracts'

type McpRow = {
  id: string
  name: string
  enabled: number
  auto_start: number
  tool_prefix: string
  startup_timeout_ms: number
  transport: ManagedMcpDefinition['transport']
  payload_json: string
}

type LogRow = {
  id: number
  mcp_id: string
  level: ManagedMcpLogEntry['level']
  source: ManagedMcpLogEntry['source']
  message: string
  timestamp: string
}

export class SqliteStore {
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath)
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
    `)
  }

  close(): void {
    this.database.close()
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
    `)

    return statement.all().map((row) => this.hydrateDefinition(row as McpRow))
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
    `)

    const payload = this.extractPayload(definition)
    statement.run(
      definition.id,
      definition.name,
      definition.enabled ? 1 : 0,
      definition.autoStart ? 1 : 0,
      definition.toolPrefix,
      definition.startupTimeoutMs,
      definition.transport,
      JSON.stringify(payload)
    )
  }

  deleteDefinition(id: string): void {
    this.database.prepare('DELETE FROM managed_mcps WHERE id = ?').run(id)
  }

  appendLog(entry: Omit<ManagedMcpLogEntry, 'id'>): ManagedMcpLogEntry {
    const result = this.database
      .prepare(
        `
        INSERT INTO mcp_logs (mcp_id, level, source, message, timestamp)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(entry.mcpId, entry.level, entry.source, entry.message, entry.timestamp)

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
      `
      )
      .run(entry.mcpId, MAX_LOG_ENTRIES_PER_MCP)

    return managedMcpLogEntrySchema.parse({
      ...entry,
      id: Number(result.lastInsertRowid)
    })
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
      `
      )
      .all(mcpId, limit) as LogRow[]

    return rows
      .reverse()
      .map((row) =>
        managedMcpLogEntrySchema.parse({
          id: row.id,
          mcpId: row.mcp_id,
          level: row.level,
          source: row.source,
          message: row.message,
          timestamp: row.timestamp
        })
      )
  }

  private hydrateDefinition(row: McpRow): ManagedMcpDefinition {
    const payload = JSON.parse(row.payload_json) as Record<string, unknown>

    return managedMcpDefinitionSchema.parse({
      id: row.id,
      name: row.name,
      enabled: Boolean(row.enabled),
      autoStart: Boolean(row.auto_start),
      toolPrefix: row.tool_prefix,
      startupTimeoutMs: row.startup_timeout_ms,
      transport: row.transport,
      ...payload
    })
  }

  private extractPayload(definition: ManagedMcpDefinition): Record<string, unknown> {
    if (definition.transport === 'stdio') {
      return {
        command: definition.command,
        args: definition.args,
        cwd: definition.cwd,
        env: definition.env,
        disabledTools: definition.disabledTools
      }
    }

    return {
      url: definition.url,
      headers: definition.headers,
      disabledTools: definition.disabledTools
    }
  }
}
