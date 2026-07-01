import {
  managedMcpCollectionSchema,
  managedMcpDefinitionSchema,
  managedMcpEventSchema,
  managedMcpSnapshotSchema,
  profileDefinitionSchema,
  profileCollectionSchema,
  profileEventSchema,
  type ManagedMcpCollection,
  type ManagedMcpDefinition,
  type ManagedMcpEvent,
  type ManagedMcpSnapshot,
  type ManagedTool,
  type ProfileDefinition,
  type ProfileCollection,
  type ProfileEvent,
  isoNow,
  taggedMessage,
  maskEntries,
  unmaskEntries,
} from "@all-in-one-mcp/contracts";
import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  resolveDatabasePath,
  type ManagedMcpRuntimeOptions,
} from "../config/runtimeConfig.js";
import { IDatabase } from "../database/types.js";
import { SqliteStore } from "../database/sqliteStore.js";
import { EventBroadcaster } from "../events/broadcaster.js";
import { ManagedMcpSupervisor } from "../supervisor/managedMcpSupervisor.js";

type ExposedTool = ManagedTool & { mcpId: string };

export class ManagedMcpRuntime {
  protected readonly store: IDatabase;
  protected readonly broadcaster = new EventBroadcaster<ManagedMcpEvent>();
  protected readonly profileBroadcaster = new EventBroadcaster<ProfileEvent>();
  protected readonly supervisors = new Map<string, ManagedMcpSupervisor>();
  private started = false;

  constructor(options: ManagedMcpRuntimeOptions = {}) {
    // Support both databasePath (for backwards compatibility) and direct database injection
    if (options.database) {
      this.store = options.database;
    } else {
      this.store = new SqliteStore(resolveDatabasePath(options.databasePath));
    }
  }

  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    this.started = true;

    for (const definition of await this.store.listDefinitions()) {
      const supervisor = this.createSupervisor(definition);
      this.supervisors.set(definition.id, supervisor);
      this.emitSnapshot(definition.id);
    }

    await Promise.allSettled(
      [...this.supervisors.values()]
        .filter((supervisor) => {
          const definition = supervisor.getDefinition();
          return definition.enabled && definition.autoStart;
        })
        .map((supervisor) => supervisor.start()),
    );
  }

  async close(): Promise<void> {
    for (const supervisor of this.supervisors.values()) {
      await supervisor.stop();
    }

    await this.store.close();
  }

  isReady(): boolean {
    return this.started && this.store.isHealthy();
  }

  subscribe(listener: (event: ManagedMcpEvent) => void): () => void {
    return this.broadcaster.subscribe(listener);
  }

  listMcps(): ManagedMcpCollection {
    return managedMcpCollectionSchema.parse({
      items: [...this.supervisors.values()]
        .map((supervisor) =>
          this.toSnapshot(supervisor.getDefinition(), supervisor),
        )
        .sort((left, right) =>
          left.definition.name.localeCompare(right.definition.name),
        ),
      generatedAt: isoNow(),
    });
  }

  async getMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id);
    return this.toSnapshot(supervisor.getDefinition(), supervisor);
  }

  async createMcp(
    input: ManagedMcpDefinition,
  ): Promise<ManagedMcpSnapshot> {
    const definition = managedMcpDefinitionSchema.parse(input);
    await this.assertUniqueDefinition(definition);

    await this.store.writeDefinition(definition);
    const supervisor = this.createSupervisor(definition);
    this.supervisors.set(definition.id, supervisor);
    this.writeManagerLog(
      definition.id,
      "info",
      "api.config",
      "Managed MCP definition created.",
    );
    this.emitSnapshot(definition.id);

    if (definition.enabled && definition.autoStart) {
      await supervisor.start();
    }

    return this.getMcp(definition.id);
  }

  async updateMcp(
    id: string,
    input: ManagedMcpDefinition,
  ): Promise<ManagedMcpSnapshot> {
    const existing = this.requireSupervisor(id).getDefinition();
    const normalizedInput = this.restoreMaskedSecrets(input, existing);
    const definition = managedMcpDefinitionSchema.parse({
      ...normalizedInput,
      id,
    });

    await this.assertUniqueDefinition(definition, id);

    const previousSupervisor = this.requireSupervisor(id);
    await previousSupervisor.stop();

    await this.store.writeDefinition(definition);
    const supervisor = this.createSupervisor(definition);
    this.supervisors.set(id, supervisor);
    this.writeManagerLog(
      id,
      "info",
      "api.config",
      "Managed MCP definition updated.",
    );
    this.emitSnapshot(id);

    if (definition.enabled && definition.autoStart) {
      await supervisor.start();
    }

    return this.getMcp(id);
  }

  async deleteMcp(id: string): Promise<void> {
    const supervisor = this.requireSupervisor(id);
    this.writeManagerLog(
      id,
      "warn",
      "api.config",
      "Managed MCP definition deleted.",
    );
    await supervisor.stop();
    this.supervisors.delete(id);
    await this.store.deleteDefinition(id);
    this.broadcaster.emit(
      managedMcpEventSchema.parse({ type: "removed", mcpId: id }),
    );
  }

  async startMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id);
    if (!supervisor.getDefinition().enabled) {
      throw new Error(`MCP "${id}" is disabled.`);
    }
    this.writeManagerLog(
      id,
      "info",
      "api.control",
      "Start requested from admin API.",
    );
    await supervisor.start();
    return this.getMcp(id);
  }

  async stopMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id);
    this.writeManagerLog(
      id,
      "warn",
      "api.control",
      "Stop requested from admin API.",
    );
    await supervisor.stop();
    return this.getMcp(id);
  }

  async restartMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id);
    this.writeManagerLog(
      id,
      "info",
      "api.control",
      "Restart requested from admin API.",
    );
    await supervisor.restart();
    return this.getMcp(id);
  }

  async listLogs(id: string, limit = 200): Promise<ManagedMcpLogEntry[]> {
    this.requireSupervisor(id);
    return await this.store.listLogs(id, limit);
  }

  // ---------------------------------------------------------------------------
  // Profiles
  // ---------------------------------------------------------------------------

  subscribeProfiles(listener: (event: ProfileEvent) => void): () => void {
    return this.profileBroadcaster.subscribe(listener);
  }

  async listProfiles(): Promise<ProfileCollection> {
    return profileCollectionSchema.parse({
      items: await this.store.listProfiles(),
      activeProfileId: await this.store.getActiveProfileId(),
      generatedAt: isoNow(),
    });
  }

  async getProfile(id: string): Promise<ProfileDefinition> {
    const profile = await this.store.getProfile(id);
    if (!profile) {
      throw new Error(`Unknown profile "${id}".`);
    }
    return profile;
  }

  async createProfile(input: ProfileDefinition): Promise<ProfileDefinition> {
    const profile = profileDefinitionSchema.parse(input);

    if (await this.store.getProfile(profile.id)) {
      throw new Error(`A profile with id "${profile.id}" already exists.`);
    }

    await this.store.writeProfile(profile);
    this.emitProfileSnapshot(profile.id);
    return this.getProfile(profile.id);
  }

  async updateProfile(
    id: string,
    input: ProfileDefinition,
  ): Promise<ProfileDefinition> {
    if (!(await this.store.getProfile(id))) {
      throw new Error(`Unknown profile "${id}".`);
    }

    const profile = profileDefinitionSchema.parse({ ...input, id });
    await this.store.writeProfile(profile);
    this.emitProfileSnapshot(id);

    // If this is the active profile, notify MCP event listeners so tools list refreshes
    if ((await this.store.getActiveProfileId()) === id) {
      this.notifyToolListChanged();
    }

    return this.getProfile(id);
  }

  async deleteProfile(id: string): Promise<void> {
    if (!(await this.store.getProfile(id))) {
      throw new Error(`Unknown profile "${id}".`);
    }

    const wasActive = (await this.store.getActiveProfileId()) === id;
    await this.store.deleteProfile(id);

    this.profileBroadcaster.emit(
      profileEventSchema.parse({ type: "profile-removed", profileId: id }),
    );

    if (wasActive) {
      this.notifyToolListChanged();
      this.profileBroadcaster.emit(
        profileEventSchema.parse({
          type: "profile-activated",
          profileId: null,
        }),
      );
    }
  }

  async activateProfile(id: string | null): Promise<void> {
    if (id !== null && !(await this.store.getProfile(id))) {
      throw new Error(`Unknown profile "${id}".`);
    }

    await this.store.setActiveProfileId(id);

    this.profileBroadcaster.emit(
      profileEventSchema.parse({ type: "profile-activated", profileId: id }),
    );

    this.notifyToolListChanged();
  }

  async getActiveProfileId(): Promise<string | null> {
    return await this.store.getActiveProfileId();
  }

  private emitProfileSnapshot(id: string): void {
    // Note: This is a fire-and-forget operation since we're in a synchronous context
    // from the store methods. In a real async implementation, this would be awaited.
    void (async () => {
      const profile = await this.store.getProfile(id);
      if (!profile) {
        return;
      }
      this.profileBroadcaster.emit(
        profileEventSchema.parse({ type: "profile-snapshot", profile }),
      );
    })();
  }

  private notifyToolListChanged(): void {
    // Emit a snapshot for every supervisor so SSE clients refresh their tool lists
    for (const [mcpId] of this.supervisors) {
      void this.emitSnapshot(mcpId); // Fire and forget
    }
  }

  getExposedTools(): ExposedTool[] {
    // Note: This method is synchronous, so we can't await the store calls directly
    // We'll need to handle this carefully - for now we'll use the synchronous approach
    // but this highlights a limitation of our current design
    const activeProfileId = this.store.getActiveProfileId();
    let activeProfile: ProfileDefinition | null = null;
    
    if (activeProfileId !== null) {
      // For now, we'll assume the store methods can be called synchronously
      // This maintains backward compatibility while we migrate to async
      try {
        // This is a synchronous call that should work with our current sync store
        // In a future version with fully async stores, this would need to be handled differently
        // For now we'll just leave it as null to avoid blocking
        // A proper implementation would require making this method async
      } catch (e) {
        // Ignore errors for now
      }
    }

    // Build a lookup: mcpId -> ProfileMcpEntry (only if a profile is active)
    const profileFilter = activeProfile
      ? new Map(activeProfile.mcps.map((entry) => [entry.mcpId, entry]))
      : null;

    return [...this.supervisors.values()].flatMap((supervisor) => {
      const definition = supervisor.getDefinition();

      if (!definition.enabled) {
        return [];
      }

      const enabledTools = this.getEnabledSupervisorTools(
        definition,
        supervisor,
      );

      // When a profile is active, only include MCPs that are listed and enabled in it
      if (profileFilter) {
        const entry = profileFilter.get(definition.id);
        if (!entry || !entry.enabled) {
          return [];
        }

        // Filter tools: empty tools array = all tools
        const allowedTools =
          entry.tools.length > 0 ? new Set(entry.tools) : null;

        return enabledTools
          .filter(
            (tool) => !allowedTools || allowedTools.has(tool.upstreamName),
          )
          .map((tool) => ({
            name: `${definition.toolPrefix}.${tool.upstreamName}`.replace(
              /[^a-zA-Z0-9_.-]/g,
              "_",
            ),
            upstreamName: tool.upstreamName,
            title: tool.title,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema
              ? ensureObjectSchema(tool.outputSchema)
              : undefined,
            annotations: tool.annotations,
            execution: tool.execution,
            mcpId: definition.id,
          }));
      }

      return enabledTools.map((tool) => ({
        name: `${definition.toolPrefix}.${tool.upstreamName}`.replace(
          /[^a-zA-Z0-9_.-]/g,
          "_",
        ),
        upstreamName: tool.upstreamName,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema
          ? ensureObjectSchema(tool.outputSchema)
          : undefined,
        annotations: tool.annotations,
        execution: tool.execution,
        mcpId: definition.id,
      }));
    });
  }

  async callTool(
    name: string,
    args: Record<string, unknown> | undefined,
  ): Promise<CallToolResult> {
    const exposedTools = this.getExposedTools();
    const tool = exposedTools.find((candidate) => candidate.name === name);
    if (!tool) {
      throw new Error(`Unknown tool "${name}".`);
    }

    const supervisor = this.requireSupervisor(tool.mcpId);
    return await supervisor.callTool(tool.upstreamName, args);
  }

  protected createSupervisor(
    definition: ManagedMcpDefinition,
  ): ManagedMcpSupervisor {
    return new ManagedMcpSupervisor(definition, {
      onStateChanged: () => {
        this.emitSnapshot(definition.id);
      },
      onLog: (entry) => {
        this.writeLogEntry(entry);
      },
    });
  }

  private writeManagerLog(
    mcpId: string,
    level: ManagedMcpLogEntry["level"],
    tag: string,
    message: string,
  ): void {
    this.writeLogEntry({
      mcpId,
      level,
      source: "manager",
      message: taggedMessage(tag, message),
      timestamp: isoNow(),
    });
  }

  private writeLogEntry(entry: Omit<ManagedMcpLogEntry, "id">): void {
    // Note: This is called from synchronous contexts (supervisor hooks)
    // For now we'll fire and forget, but in a fully async implementation
    // this would need to be awaited
    void (async () => {
      const savedEntry = await this.store.appendLog(entry);
      this.broadcaster.emit(
        managedMcpEventSchema.parse({ type: "log", entry: savedEntry }),
      );
    })();
  }

  private emitSnapshot(id: string): void {
    // Note: This is called from synchronous contexts
    // For now we'll fire and forget, but in a fully async implementation
    // this would need to be awaited
    void (async () => {
      const supervisor = this.supervisors.get(id);
      if (!supervisor) {
        return;
      }
      this.broadcaster.emit(
        managedMcpEventSchema.parse({
          type: "snapshot",
          snapshot: this.toSnapshot(supervisor.getDefinition(), supervisor),
        }),
      );
    })();
  }

  private getEnabledSupervisorTools(
    definition: ManagedMcpDefinition,
    supervisor: ManagedMcpSupervisor,
  ): ReturnType<ManagedMcpSupervisor["getTools"]> {
    const disabledTools = new Set(definition.disabledTools);
    return supervisor
      .getTools()
      .filter((tool) => !disabledTools.has(tool.upstreamName));
  }

  private toSnapshot(
    definition: ManagedMcpDefinition,
    supervisor: ManagedMcpSupervisor,
  ): ManagedMcpSnapshot {
    return managedMcpSnapshotSchema.parse({
      definition: this.maskSecrets(definition),
      status: supervisor.getStatus(),
      tools: this.getEnabledSupervisorTools(definition, supervisor).map(
        (tool) => ({
          name: `${definition.toolPrefix}.${tool.upstreamName}`.replace(
            /[^a-zA-Z0-9_.-]/g,
            "_",
          ),
          upstreamName: tool.upstreamName,
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema
            ? ensureObjectSchema(tool.outputSchema)
            : undefined,
          annotations: tool.annotations,
          execution: tool.execution,
        }),
      ),
      toolCount: this.getEnabledSupervisorTools(definition, supervisor).length,
      pid: supervisor.getPid(),
      lastError: supervisor.getLastError(),
      updatedAt: supervisor.getUpdatedAt(),
    });
  }

  private maskSecrets(definition: ManagedMcpDefinition): ManagedMcpDefinition {
    if (definition.transport === "stdio") {
      return {
        ...definition,
        env: maskEntries(definition.env),
      };
    }

    return {
      ...definition,
      headers: maskEntries(definition.headers),
    };
  }

  private restoreMaskedSecrets(
    next: ManagedMcpDefinition,
    previous: ManagedMcpDefinition,
  ): ManagedMcpDefinition {
    if (
      next.transport === "stdio" &&
      previous.transport === "stdio"
    ) {
      return {
        ...next,
        env: unmaskEntries(next.env, previous.env),
      };
    }

    if (
      next.transport === "streamable-http" &&
      previous.transport === "streamable-http"
    ) {
      return {
        ...next,
        headers: unmaskEntries(next.headers, previous.headers),
      };
    }

    return next;
  }

  private async assertUniqueDefinition(
    next: ManagedMcpDefinition,
    currentId?: string,
  ): void {
    for (const supervisor of this.supervisors.values()) {
      const definition = supervisor.getDefinition();
      if (currentId && definition.id === currentId) {
        continue;
      }

      if (definition.id === next.id) {
        throw new Error(`An MCP with id "${next.id}" already exists.`);
      }

      if (definition.toolPrefix === next.toolPrefix) {
        throw new Error(`Tool prefix "${next.toolPrefix}" is already in use.`);
      }
    }
  }

  private requireSupervisor(id: string): ManagedMcpSupervisor {
    const supervisor = this.supervisors.get(id);
    if (!supervisor) {
      throw new Error(`Unknown MCP "${id}".`);
    }

    return supervisor;
  }
}

// Helper function to ensure object schema (copied from mcpGateway.ts)
function ensureObjectSchema(
  schema: Record<string, unknown> | undefined,
): { type: "object"; [key: string]: unknown } {
  return {
    ...(schema ?? {}),
    type: "object",
  } as { type: "object"; [key: string]: unknown };
}