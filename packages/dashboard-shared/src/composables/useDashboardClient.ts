import type {
  ManagedMcpCollection,
  ManagedMcpDefinition,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot,
  ProfileCollection,
  ProfileDefinition,
} from "@all-in-one-mcp/contracts";

export type DashboardAction = "start" | "stop" | "restart";

export type DashboardClient = {
  fetchMcps(): Promise<ManagedMcpCollection>;
  fetchLogs(
    mcpId: string,
    limit: number,
  ): Promise<{ items: ManagedMcpLogEntry[]; generatedAt?: string }>;
  createEventSource(): EventSource;
  mutateMcp(id: string, action: DashboardAction): Promise<ManagedMcpSnapshot>;
  createDefinition(
    definition: ManagedMcpDefinition,
  ): Promise<ManagedMcpSnapshot>;
  updateDefinition(
    id: string,
    definition: ManagedMcpDefinition,
  ): Promise<ManagedMcpSnapshot>;
  fetchProfiles(): Promise<ProfileCollection>;
  createProfile(profile: ProfileDefinition): Promise<ProfileDefinition>;
  updateProfile(
    id: string,
    profile: ProfileDefinition,
  ): Promise<ProfileDefinition>;
  deleteProfile(id: string): Promise<void>;
  activateProfile(id: string): Promise<void>;
  deactivateProfile(): Promise<void>;
};

export type SettingsAdapter = {
  title?: string;
  description?: string;
  isEnabled(): Promise<boolean>;
  setEnabled(enabled: boolean): Promise<void>;
};

export type DesktopAdapter = {
  openLogsFolder(): Promise<void>;
  openDataFolder(): Promise<void>;
  pickFile?(title?: string): Promise<string | null>;
  pickDirectory?(title?: string): Promise<string | null>;
};
