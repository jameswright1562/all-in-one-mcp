import type { ManagedMcpSnapshot } from '@all-in-one-mcp/contracts'

export function statusRatio(snapshot: ManagedMcpSnapshot | null): number {
  if (!snapshot) {
    return 0
  }

  switch (snapshot.status) {
    case 'ready':
      return 1
    case 'starting':
      return 0.74
    case 'degraded':
      return 0.58
    case 'stopping':
      return 0.42
    case 'error':
      return 0.24
    case 'stopped':
      return 0.16
    default:
      return 0
  }
}

export function stoplightRatio(value: number): number {
  return Math.max(0.08, Math.min(1, value))
}
