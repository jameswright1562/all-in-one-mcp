import type {
  ManagedMcpCollection,
  ManagedMcpDefinition,
  ManagedMcpEvent,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot
} from '@all-in-one-mcp/contracts'

type LogLevelFilter = 'all' | ManagedMcpLogEntry['level']

const LOG_LIMIT = 1_000
const EVENT_QUEUE_LIMIT = 500

export function sortSnapshots(items: ManagedMcpSnapshot[]): ManagedMcpSnapshot[] {
  return [...items].sort((left, right) => left.definition.name.localeCompare(right.definition.name))
}

export function upsertSnapshot(items: ManagedMcpSnapshot[], next: ManagedMcpSnapshot): ManagedMcpSnapshot[] {
  return sortSnapshots([...items.filter((item) => item.definition.id !== next.definition.id), next])
}

export function matchesSearch(entry: ManagedMcpLogEntry, query: string): boolean {
  if (!query) {
    return true
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return [entry.level, entry.source, entry.message, entry.timestamp].some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  )
}

export function createLogCollectionResponse(items: ManagedMcpLogEntry[]): { items: ManagedMcpLogEntry[] } {
  return { items }
}

export function createManagedMcpCollection(items: ManagedMcpSnapshot[]): ManagedMcpCollection {
  return { items }
}
