import type {
  ManagedMcpDefinition,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot,
} from "all-in-one-mcp/contracts";

export type PortalSection = "logs" | "fleet" | "config" | "tools";
export type ConfigMode = "create" | "edit";
export type ThemeMode = "light" | "dark";
export type HealthMetricTone = "primary" | "secondary" | "tertiary";

export type HealthMetric = {
  label: string;
  value: string;
  ratio: number;
  tone: HealthMetricTone;
};

export type MetadataTag = {
  label: string;
  value: string;
};

export type EventStreamItem = {
  id: string;
  title: string;
  message: string;
  level: ManagedMcpLogEntry["level"];
  relativeTime: string;
};

export type ConsoleLogRow = {
  id: number;
  level: ManagedMcpLogEntry["level"];
  time: string;
  category: string;
  message: string;
};

export type FormState = {
  id: string;
  name: string;
  toolPrefix: string;
  transport: ManagedMcpDefinition["transport"];
  command: string;
  argsText: string;
  cwd: string;
  url: string;
  enabled: boolean;
  autoStart: boolean;
  startupTimeoutMs: number;
};

export type NavItem = {
  id: PortalSection;
  label: string;
  shortLabel: string;
};

export type LevelOption = {
  label: string;
  value: "all" | ManagedMcpLogEntry["level"];
};

export type { ManagedMcpDefinition, ManagedMcpLogEntry, ManagedMcpSnapshot };
