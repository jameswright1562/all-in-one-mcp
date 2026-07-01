import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

export class SupabaseStore implements IDatabase {
  private supabase: SupabaseClient;

  constructor(url: string, key: string) {
    this.supabase = createClient(url, key);
  }

  async listDefinitions(): Promise<ManagedMcpDefinition[]> {
    const { data, error } = await this.supabase
      .from("managed_mcps")
      .select("*")
      .order("name");

    if (error) {
      throw error;
    }

    // Validate and transform data
    const validatedData = data?.map((row) =>
      managedMcpDefinitionSchema.parse({
        ...row,
        // Convert JSON string back to object for args if needed
        args: row.args ? JSON.parse(row.args) : undefined,
        env: row.env ? JSON.parse(row.env) : undefined,
        headers: row.headers ? JSON.parse(row.headers) : undefined,
        disabledTools: row.disabledTools
          ? JSON.parse(row.disabledTools)
          : undefined,
      })
    ) ?? [];

    return validatedData;
  }

  async getDefinition(id: string): Promise<ManagedMcpDefinition | null> {
    const { data, error } = await this.supabase
      .from("managed_mcps")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    return managedMcpDefinitionSchema.parse({
      ...data,
      // Convert JSON string back to object for args if needed
      args: data.args ? JSON.parse(data.args) : undefined,
      env: data.env ? JSON.parse(data.env) : undefined,
      headers: data.headers ? JSON.parse(data.headers) : undefined,
      disabledTools: data.disabledTools
        ? JSON.parse(data.disabledTools)
        : undefined,
    });
  }

  async writeDefinition(definition: ManagedMcpDefinition): Promise<void> {
    // Validate the definition
    const validatedDef = managedMcpDefinitionSchema.parse(definition);

    const mcpRow: McpRow = {
      id: validatedDef.id,
      name: validatedDef.name,
      enabled: validatedDef.enabled,
      auto_start: validatedDef.auto_start,
      tool_prefix: validatedDef.tool_prefix,
      startup_timeout_ms: validatedDef.startup_timeout_ms,
      transport: validatedDef.transport,
      command: validatedDef.command,
      args: validatedDef.args ? JSON.stringify(validatedDef.args) : undefined,
      cwd: validatedDef.cwd,
      url: validatedDef.url,
      headers: validatedDef.headers
        ? JSON.stringify(validatedDef.headers)
        : undefined,
      env: validatedDef.env ? JSON.stringify(validatedDef.env) : undefined,
      disabledTools: validatedDef.disabledTools
        ? JSON.stringify(validatedDef.disabledTools)
        : undefined,
      payload_json: JSON.stringify(validatedDef),
    };

    const { error } = await this.supabase
      .from("managed_mcps")
      .upsert(mcpRow, { onConflict: ["id"] });

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
    entry: Omit<ManagedMcpLogEntry, "id">
  ): Promise<ManagedMcpLogEntry> {
    // Validate the entry
    const validatedEntry = managedMcpLogEntrySchema.parse(entry);

    const logRow: LogRow = {
      mcp_id: validatedEntry.mcpId,
      level: validatedEntry.level,
      source: validatedEntry.source,
      message: validatedEntry.message,
      timestamp: validatedEntry.timestamp.toISOString(),
    };

    const { data, error } = await this.supabase
      .from("mcp_logs")
      .insert(logRow)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (!data) {
      throw new Error("Failed to insert log entry");
    }

    // Clean up old logs if needed (keeping only the most recent entries)
    const limit = Number(
      process.env.MAX_LOG_ENTRIES_PER_MCP ?? 1000
    );
    const { error: cleanupError } = await this.supabase
      .from("mcp_logs")
      .delete()
      .filter(
        "id",
        "not.in",
        `(SELECT id FROM mcp_logs WHERE mcp_id = '${validatedEntry.mcpId}' ORDER BY id DESC LIMIT ${limit})`
      );

    if (cleanupError) {
      // Log cleanup error but don't fail the operation
      console.warn("Failed to cleanup old logs:", cleanupError);
    }

    return managedMcpLogEntrySchema.parse({
      ...data,
      timestamp: new Date(data.timestamp),
    });
  }

  async listLogs(
    mcpId: string,
    limit = 200
  ): Promise<ManagedMcpLogEntry[]> {
    const { data, error } = await this.supabase
      .from("mcp_logs")
      .select("*")
      .eq("mcp_id", mcpId)
      .order("id", { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    return (data ?? []).map((row) =>
      managedMcpLogEntrySchema.parse({
        ...row,
        timestamp: new Date(row.timestamp),
      })
    );
  }

  async listProfiles(): Promise<ProfileDefinition[]> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .order("name");

    if (error) {
      throw error;
    }

    const validatedData = data?.map((row) =>
      profileDefinitionSchema.parse(row)
    ) ?? [];

    return validatedData;
  }

  async getProfile(id: string): Promise<ProfileDefinition | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    return profileDefinitionSchema.parse(data);
  }

  async writeProfile(profile: ProfileDefinition): Promise<void> {
    // Validate the profile
    const validatedProfile = profileDefinitionSchema.parse(profile);

    const profileRow: ProfileRow = {
      id: validatedProfile.id,
      name: validatedProfile.name,
      description: validatedProfile.description,
    };

    const { error } = await this.supabase
      .from("profiles")
      .upsert(profileRow, { onConflict: ["id"] });

    if (error) {
      throw error;
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
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        // No rows found
        return null;
      }
      throw error;
    }

    if (!data) {
      return null;
    }

    return data.profile_id;
  }

  async setActiveProfileId(profileId: string | null): Promise<void> {
    if (profileId === null) {
      const { error } = await this.supabase
        .from("active_profile")
        .delete()
        .neq("profile_id", null); // Delete any existing row

      if (error) {
        throw error;
      }
    } else {
      const profileRow: ActiveProfileRow = {
        profile_id: profileId,
      };

      const { error } = await this.supabase
        .from("active_profile")
        .upsert(profileRow, { onConflict: [] }); // No conflict target means insert or update all rows

      if (error) {
        throw error;
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    try {
      const { error } = await this.supabase.from("managed_mcps").select("id").limit(1);
      return !error;
    } catch (error) {
      return false;
    }
  }

  async close(): Promise<void> {
    // Supabase client doesn't need explicit closing
    // But we'll keep the method for interface compliance
  }
}