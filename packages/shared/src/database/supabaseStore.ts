import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
  singleton?: number;
  profile_id: string | null;
};

function parseJsonValue<T>(value: T | string): T {
  return typeof value === "string" ? (JSON.parse(value) as T) : value;
}

export class SupabaseStore implements IDatabase {
  private readonly supabase: SupabaseClient;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key);
  }

  async listDefinitions(): Promise<ManagedMcpDefinition[]> {
    const { data, error } = await this.supabase
      .from("managed_mcps")
      .select("id, name, enabled, auto_start, tool_prefix, startup_timeout_ms, transport, payload_json")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) => this.hydrateDefinition(row as McpRow));
  }

  async getDefinition(id: string): Promise<ManagedMcpDefinition | null> {
    const { data, error } = await this.supabase
      .from("managed_mcps")
      .select("id, name, enabled, auto_start, tool_prefix, startup_timeout_ms, transport, payload_json")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? this.hydrateDefinition(data as McpRow) : null;
  }

  async writeDefinition(definition: ManagedMcpDefinition): Promise<void> {
    const payload = this.extractPayload(definition);
    const row: McpRow = {
      id: definition.id,
      name: definition.name,
      enabled: definition.enabled,
      auto_start: definition.autoStart,
      tool_prefix: definition.toolPrefix,
      startup_timeout_ms: definition.startupTimeoutMs,
      transport: definition.transport,
      payload_json: payload,
    };

    const { error } = await this.supabase
      .from("managed_mcps")
      .upsert(row, { onConflict: "id" });

    if (error) {
      throw error;
    }
  }

  async deleteDefinition(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("managed_mcps")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }
  }

  async appendLog(
    entry: Omit<ManagedMcpLogEntry, "id">,
  ): Promise<ManagedMcpLogEntry> {
    const { data, error } = await this.supabase
      .from("mcp_logs")
      .insert({
        mcp_id: entry.mcpId,
        level: entry.level,
        source: entry.source,
        message: entry.message,
        timestamp: entry.timestamp,
      })
      .select("id, mcp_id, level, source, message, timestamp")
      .single();

    if (error) {
      throw error;
    }

    const { data: staleRows, error: staleError } = await this.supabase
      .from("mcp_logs")
      .select("id")
      .eq("mcp_id", entry.mcpId)
      .order("id", { ascending: false })
      .range(MAX_LOG_ENTRIES_PER_MCP, MAX_LOG_ENTRIES_PER_MCP + 1000);

    if (staleError) {
      throw staleError;
    }

    if (staleRows && staleRows.length > 0) {
      const { error: deleteError } = await this.supabase
        .from("mcp_logs")
        .delete()
        .in(
          "id",
          staleRows
            .map((row) => Number((row as { id: number }).id))
            .filter((value) => Number.isFinite(value)),
        );

      if (deleteError) {
        throw deleteError;
      }
    }

    return managedMcpLogEntrySchema.parse({
      id: Number((data as LogRow).id),
      mcpId: (data as LogRow).mcp_id,
      level: (data as LogRow).level,
      source: (data as LogRow).source,
      message: (data as LogRow).message,
      timestamp: (data as LogRow).timestamp,
    });
  }

  async listLogs(mcpId: string, limit = 200): Promise<ManagedMcpLogEntry[]> {
    const { data, error } = await this.supabase
      .from("mcp_logs")
      .select("id, mcp_id, level, source, message, timestamp")
      .eq("mcp_id", mcpId)
      .order("id", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data as LogRow[] | null ?? [])
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
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, name, description")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return Promise.all(
      ((data as ProfileRow[] | null) ?? []).map((row) => this.hydrateProfile(row)),
    );
  }

  async getProfile(id: string): Promise<ProfileDefinition | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("id, name, description")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data ? this.hydrateProfile(data as ProfileRow) : null;
  }

  async writeProfile(profile: ProfileDefinition): Promise<void> {
    const { error: profileError } = await this.supabase
      .from("profiles")
      .upsert(
        {
          id: profile.id,
          name: profile.name,
          description: profile.description,
        },
        { onConflict: "id" },
      );

    if (profileError) {
      throw profileError;
    }

    const { error: deleteError } = await this.supabase
      .from("profile_mcps")
      .delete()
      .eq("profile_id", profile.id);

    if (deleteError) {
      throw deleteError;
    }

    if (profile.mcps.length === 0) {
      return;
    }

    const rows = profile.mcps.map((entry) => ({
      profile_id: profile.id,
      mcp_id: entry.mcpId,
      enabled: entry.enabled,
      tools_json: entry.tools,
    }));

    const { error: insertError } = await this.supabase
      .from("profile_mcps")
      .insert(rows);

    if (insertError) {
      throw insertError;
    }
  }

  async deleteProfile(id: string): Promise<void> {
    const { error } = await this.supabase
      .from("profiles")
      .delete()
      .eq("id", id);

    if (error) {
      throw error;
    }
  }

  async getActiveProfileId(): Promise<string | null> {
    const { data, error } = await this.supabase
      .from("active_profile")
      .select("profile_id")
      .eq("singleton", 1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    return (data as ActiveProfileRow | null)?.profile_id ?? null;
  }

  async setActiveProfileId(profileId: string | null): Promise<void> {
    const { error } = await this.supabase
      .from("active_profile")
      .upsert({ singleton: 1, profile_id: profileId }, { onConflict: "singleton" });

    if (error) {
      throw error;
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from("managed_mcps")
        .select("id")
        .limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // Supabase manages connection lifecycle internally.
  }

  private async hydrateProfile(row: ProfileRow): Promise<ProfileDefinition> {
    const { data, error } = await this.supabase
      .from("profile_mcps")
      .select("profile_id, mcp_id, enabled, tools_json")
      .eq("profile_id", row.id);

    if (error) {
      throw error;
    }

    const mcps: ProfileMcpEntry[] = ((data as ProfileMcpRow[] | null) ?? []).map(
      (mcpRow) => ({
        mcpId: mcpRow.mcp_id,
        enabled: Boolean(mcpRow.enabled),
        tools: parseJsonValue<string[]>(mcpRow.tools_json),
      }),
    );

    return profileDefinitionSchema.parse({
      id: row.id,
      name: row.name,
      description: row.description,
      mcps,
    });
  }

  private hydrateDefinition(row: McpRow): ManagedMcpDefinition {
    const payload = parseJsonValue<Record<string, unknown>>(row.payload_json);

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