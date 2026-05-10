import type {
  ManagedMcpLogEntry,
  ManagedMcpSnapshot,
} from "@all-in-one-mcp/contracts";

export const STATUS_RATIO_BY_STATE: Record<
  NonNullable<ManagedMcpSnapshot["status"]>,
  number
> = {
  ready: 1,
  starting: 0.74,
  degraded: 0.58,
  stopping: 0.42,
  error: 0.24,
  stopped: 0.16,
};

export function formatClock(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

export function formatRelativeTime(timestamp: string): string {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(timestamp).getTime()) / 1_000),
  );

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function titleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function sourceLabel(source: ManagedMcpLogEntry["source"]): string {
  switch (source) {
    case "manager":
      return "core.manager";
    case "stdout":
      return "process.stdout";
    case "stderr":
      return "process.stderr";
    case "transport":
      return "net.transport";
    case "upstream":
      return "upstream.service";
    default:
      return source;
  }
}

export function parseLogMessage(entry: ManagedMcpLogEntry): {
  category: string;
  message: string;
} {
  const prefixedMessage = entry.message.match(/^\[([a-z0-9._-]+)\]\s*(.*)$/i);

  if (prefixedMessage) {
    const [, category = sourceLabel(entry.source), message = entry.message] =
      prefixedMessage;

    return {
      category,
      message: message || entry.message,
    };
  }

  return {
    category: sourceLabel(entry.source),
    message: entry.message,
  };
}

export function statusRatio(snapshot: ManagedMcpSnapshot | null): number {
  if (!snapshot) {
    return 0;
  }

  return STATUS_RATIO_BY_STATE[snapshot.status] ?? 0;
}

export function stoplightRatio(value: number): number {
  return Math.max(0.08, Math.min(1, value));
}
