import type { ManagedMcpEvent, ManagedMcpSnapshot } from '@all-in-one-mcp/contracts'
import { upsertSnapshot } from './useMcpDashboard-helpers'

export function applyEvent(
  payload: ManagedMcpEvent,
  items: ManagedMcpSnapshot[],
  logCache: Record<string, any[]>,
  streamPaused: boolean,
  queuedEvents: ManagedMcpEvent[],
  appendLog: (entry: any) => void
): { items: ManagedMcpSnapshot[]; logCache: Record<string, any[]>; queuedEvents: ManagedMcpEvent[] } {
  if (streamPaused) {
    if (queuedEvents.length >= EVENT_QUEUE_LIMIT) {
      queuedEvents.shift()
    }

    queuedEvents.push(payload)
    return { items, logCache, queuedEvents }
  }

  if (payload.type === 'snapshot') {
    items = upsertSnapshot(items, payload.snapshot)

    if (!items.length) {
      return { items, logCache, queuedEvents }
    }

    return { items, logCache, queuedEvents }
  }

  if (payload.type === 'log') {
    appendLog(payload.entry)
    return { items, logCache, queuedEvents }
  }

  items = items.filter((item) => item.definition.id !== payload.mcpId)

  if (payload.mcpId in logCache) {
    const nextCache = { ...logCache }
    delete nextCache[payload.mcpId]
    logCache = nextCache
  }

  return { items, logCache, queuedEvents }
}

export function flushQueuedEvents(
  queuedEvents: ManagedMcpEvent[],
  applyFn: (payload: ManagedMcpEvent) => void
): ManagedMcpEvent[] {
  while (queuedEvents.length > 0) {
    const payload = queuedEvents.shift()
    if (payload) {
      applyFn(payload)
    }
  }
  return queuedEvents
}
