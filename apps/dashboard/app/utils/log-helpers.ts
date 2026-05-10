import type { ManagedMcpLogEntry } from '@all-in-one-mcp/contracts'

export function sourceLabel(source: ManagedMcpLogEntry['source']): string {
  switch (source) {
    case 'manager':
      return 'core.manager'
    case 'stdout':
      return 'process.stdout'
    case 'stderr':
      return 'process.stderr'
    case 'transport':
      return 'net.transport'
    case 'upstream':
      return 'upstream.service'
    default:
      return source
  }
}

export function parseLogMessage(entry: ManagedMcpLogEntry): { category: string; message: string } {
  const prefixedMessage = entry.message.match(/^\[([a-z0-9._-]+)\]\s*(.*)$/i)

  if (prefixedMessage) {
    const [, category = sourceLabel(entry.source), message = entry.message] = prefixedMessage

    return {
      category,
      message: message || entry.message
    }
  }

  return {
    category: sourceLabel(entry.source),
    message: entry.message
  }
}
