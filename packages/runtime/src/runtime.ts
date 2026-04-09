import {
  SECRET_MASK,
  managedMcpCollectionSchema,
  managedMcpDefinitionSchema,
  managedMcpEventSchema,
  managedMcpSnapshotSchema,
  type KeyValuePair,
  type ManagedMcpCollection,
  type ManagedMcpDefinition,
  type ManagedMcpEvent,
  type ManagedMcpLogEntry,
  type ManagedMcpSnapshot,
  type ManagedTool
} from '@all-in-one-mcp/contracts'
import { type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { resolveDatabasePath, type ManagedMcpRuntimeOptions } from './config/runtimeConfig.js'
import { SqliteStore } from './database/sqliteStore.js'
import { EventBroadcaster } from './events/broadcaster.js'
import { McpGateway } from './gateway/mcpGateway.js'
import { ManagedMcpSupervisor } from './supervisor/managedMcpSupervisor.js'

function isoNow(): string {
  return new Date().toISOString()
}

function taggedMessage(tag: string, message: string): string {
  return `[${tag}] ${message}`
}

function maskEntries(entries: KeyValuePair[]): KeyValuePair[] {
  return entries.map((entry) => ({
    key: entry.key,
    value: SECRET_MASK,
    masked: true
  }))
}

function unmaskEntries(nextEntries: KeyValuePair[], previousEntries: KeyValuePair[] | undefined): KeyValuePair[] {
  const previousMap = new Map((previousEntries ?? []).map((entry) => [entry.key, entry.value]))

  return nextEntries.map((entry) => ({
    key: entry.key,
    value: entry.masked && entry.value === SECRET_MASK ? (previousMap.get(entry.key) ?? '') : entry.value
  }))
}

type ExposedTool = ManagedTool & { mcpId: string }

export class ManagedMcpRuntime {
  private readonly store: SqliteStore
  private readonly broadcaster = new EventBroadcaster<ManagedMcpEvent>()
  private readonly supervisors = new Map<string, ManagedMcpSupervisor>()
  private readonly gateway: McpGateway
  private started = false

  constructor(options: ManagedMcpRuntimeOptions = {}) {
    this.store = new SqliteStore(resolveDatabasePath(options.databasePath))
    this.gateway = new McpGateway(this)
  }

  async start(): Promise<void> {
    if (this.started) {
      return
    }

    this.started = true

    for (const definition of this.store.listDefinitions()) {
      const supervisor = this.createSupervisor(definition)
      this.supervisors.set(definition.id, supervisor)
      this.emitSnapshot(definition.id)
    }

    await Promise.allSettled(
      [...this.supervisors.values()]
        .filter((supervisor) => {
          const definition = supervisor.getDefinition()
          return definition.enabled && definition.autoStart
        })
        .map((supervisor) => supervisor.start())
    )
  }

  async close(): Promise<void> {
    await this.gateway.close()

    for (const supervisor of this.supervisors.values()) {
      await supervisor.stop()
    }

    this.store.close()
  }

  subscribe(listener: (event: ManagedMcpEvent) => void): () => void {
    return this.broadcaster.subscribe(listener)
  }

  async handleGatewayHttpRequest(
    req: Parameters<McpGateway['handleNodeRequest']>[0],
    res: Parameters<McpGateway['handleNodeRequest']>[1],
    parsedBody?: unknown
  ): Promise<void> {
    await this.gateway.handleNodeRequest(req, res, parsedBody)
  }

  listMcps(): ManagedMcpCollection {
    return managedMcpCollectionSchema.parse({
      items: [...this.supervisors.values()]
        .map((supervisor) => this.toSnapshot(supervisor.getDefinition(), supervisor))
        .sort((left, right) => left.definition.name.localeCompare(right.definition.name)),
      generatedAt: isoNow()
    })
  }

  getMcp(id: string): ManagedMcpSnapshot {
    const supervisor = this.requireSupervisor(id)
    return this.toSnapshot(supervisor.getDefinition(), supervisor)
  }

  async createMcp(input: ManagedMcpDefinition): Promise<ManagedMcpSnapshot> {
    const definition = managedMcpDefinitionSchema.parse(input)
    this.assertUniqueDefinition(definition)

    this.store.writeDefinition(definition)
    const supervisor = this.createSupervisor(definition)
    this.supervisors.set(definition.id, supervisor)
    this.writeManagerLog(definition.id, 'info', 'api.config', 'Managed MCP definition created.')
    this.emitSnapshot(definition.id)

    if (definition.enabled && definition.autoStart) {
      await supervisor.start()
    }

    return this.getMcp(definition.id)
  }

  async updateMcp(id: string, input: ManagedMcpDefinition): Promise<ManagedMcpSnapshot> {
    const existing = this.requireSupervisor(id).getDefinition()
    const normalizedInput = this.restoreMaskedSecrets(input, existing)
    const definition = managedMcpDefinitionSchema.parse({
      ...normalizedInput,
      id
    })

    this.assertUniqueDefinition(definition, id)

    const previousSupervisor = this.requireSupervisor(id)
    await previousSupervisor.stop()

    this.store.writeDefinition(definition)
    const supervisor = this.createSupervisor(definition)
    this.supervisors.set(id, supervisor)
    this.writeManagerLog(id, 'info', 'api.config', 'Managed MCP definition updated.')
    this.emitSnapshot(id)

    if (definition.enabled && definition.autoStart) {
      await supervisor.start()
    }

    return this.getMcp(id)
  }

  async deleteMcp(id: string): Promise<void> {
    const supervisor = this.requireSupervisor(id)
    this.writeManagerLog(id, 'warn', 'api.config', 'Managed MCP definition deleted.')
    await supervisor.stop()
    this.supervisors.delete(id)
    this.store.deleteDefinition(id)
    this.broadcaster.emit(managedMcpEventSchema.parse({ type: 'removed', mcpId: id }))
  }

  async startMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id)
    this.writeManagerLog(id, 'info', 'api.control', 'Start requested from admin API.')
    await supervisor.start()
    return this.getMcp(id)
  }

  async stopMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id)
    this.writeManagerLog(id, 'warn', 'api.control', 'Stop requested from admin API.')
    await supervisor.stop()
    return this.getMcp(id)
  }

  async restartMcp(id: string): Promise<ManagedMcpSnapshot> {
    const supervisor = this.requireSupervisor(id)
    this.writeManagerLog(id, 'info', 'api.control', 'Restart requested from admin API.')
    await supervisor.restart()
    return this.getMcp(id)
  }

  listLogs(id: string, limit = 200): ManagedMcpLogEntry[] {
    this.requireSupervisor(id)
    return this.store.listLogs(id, limit)
  }

  getExposedTools(): ExposedTool[] {
    return [...this.supervisors.values()].flatMap((supervisor) => {
      const definition = supervisor.getDefinition()
      return supervisor.getTools().map((tool) => ({
        name: `${definition.toolPrefix}.${tool.upstreamName}`,
        upstreamName: tool.upstreamName,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        execution: tool.execution,
        mcpId: definition.id
      }))
    })
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<CallToolResult> {
    const tool = this.getExposedTools().find((candidate) => candidate.name === name)
    if (!tool) {
      throw new Error(`Unknown tool "${name}".`)
    }

    const supervisor = this.requireSupervisor(tool.mcpId)
    return supervisor.callTool(tool.upstreamName, args)
  }

  private createSupervisor(definition: ManagedMcpDefinition): ManagedMcpSupervisor {
    return new ManagedMcpSupervisor(definition, {
      onStateChanged: () => {
        this.emitSnapshot(definition.id)
      },
      onLog: (entry) => {
        this.writeLogEntry(entry)
      }
    })
  }

  private writeManagerLog(
    mcpId: string,
    level: ManagedMcpLogEntry['level'],
    tag: string,
    message: string
  ): void {
    this.writeLogEntry({
      mcpId,
      level,
      source: 'manager',
      message: taggedMessage(tag, message),
      timestamp: isoNow()
    })
  }

  private writeLogEntry(entry: Omit<ManagedMcpLogEntry, 'id'>): void {
    const savedEntry = this.store.appendLog(entry)
    this.broadcaster.emit(managedMcpEventSchema.parse({ type: 'log', entry: savedEntry }))
  }

  private emitSnapshot(id: string): void {
    const supervisor = this.supervisors.get(id)
    if (!supervisor) {
      return
    }

    this.broadcaster.emit(
      managedMcpEventSchema.parse({
        type: 'snapshot',
        snapshot: this.toSnapshot(supervisor.getDefinition(), supervisor)
      })
    )
  }

  private toSnapshot(definition: ManagedMcpDefinition, supervisor: ManagedMcpSupervisor): ManagedMcpSnapshot {
    return managedMcpSnapshotSchema.parse({
      definition: this.maskSecrets(definition),
      status: supervisor.getStatus(),
      tools: supervisor.getTools().map((tool) => ({
        name: `${definition.toolPrefix}.${tool.upstreamName}`,
        upstreamName: tool.upstreamName,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
        execution: tool.execution
      })),
      toolCount: supervisor.getTools().length,
      pid: supervisor.getPid(),
      lastError: supervisor.getLastError(),
      updatedAt: supervisor.getUpdatedAt()
    })
  }

  private maskSecrets(definition: ManagedMcpDefinition): ManagedMcpDefinition {
    if (definition.transport === 'stdio') {
      return {
        ...definition,
        env: maskEntries(definition.env)
      }
    }

    return {
      ...definition,
      headers: maskEntries(definition.headers)
    }
  }

  private restoreMaskedSecrets(next: ManagedMcpDefinition, previous: ManagedMcpDefinition): ManagedMcpDefinition {
    if (next.transport === 'stdio' && previous.transport === 'stdio') {
      return {
        ...next,
        env: unmaskEntries(next.env, previous.env)
      }
    }

    if (next.transport === 'streamable-http' && previous.transport === 'streamable-http') {
      return {
        ...next,
        headers: unmaskEntries(next.headers, previous.headers)
      }
    }

    return next
  }

  private assertUniqueDefinition(next: ManagedMcpDefinition, currentId?: string): void {
    for (const supervisor of this.supervisors.values()) {
      const definition = supervisor.getDefinition()
      if (currentId && definition.id === currentId) {
        continue
      }

      if (definition.id === next.id) {
        throw new Error(`An MCP with id "${next.id}" already exists.`)
      }

      if (definition.toolPrefix === next.toolPrefix) {
        throw new Error(`Tool prefix "${next.toolPrefix}" is already in use.`)
      }
    }
  }

  private requireSupervisor(id: string): ManagedMcpSupervisor {
    const supervisor = this.supervisors.get(id)
    if (!supervisor) {
      throw new Error(`Unknown MCP "${id}".`)
    }

    return supervisor
  }
}

export function createManagedMcpRuntime(options: ManagedMcpRuntimeOptions = {}): ManagedMcpRuntime {
  return new ManagedMcpRuntime(options)
}
