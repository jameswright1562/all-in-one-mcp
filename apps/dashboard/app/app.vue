<script setup lang="ts">
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  managedMcpDefinitionSchema,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ManagedMcpSnapshot,
} from "all-in-one-mcp/contracts";
import { useMcpDashboard } from "./composables/useMcpDashboard";
import { useProfilesDashboard } from "./composables/useProfilesDashboard";
import type {
  ConfigMode,
  ConsoleLogRow,
  EventStreamItem,
  FormState,
  HealthMetric,
  LevelOption,
  MetadataTag,
  NavItem,
  PortalSection,
  ThemeMode,
} from "./types/dashboard";

const TOTAL_LOG_LIMIT = 1_000;

const dashboard = useMcpDashboard();
const {
  items,
  logs,
  rawLogs,
  selected,
  selectedId,
  searchQuery,
  levelFilter,
  streamPaused,
  loading,
  actioning,
  saving,
  select,
  invokeAction,
  createDefinition,
  updateDefinition,
  setStreamPaused,
} = dashboard;

const profilesDashboard = useProfilesDashboard();

dashboard.onProfileEvent((event) => {
  profilesDashboard.applyEvent(event);
});
dashboard.onProfilesReady((collection) => {
  profilesDashboard.setProfiles(collection);
});

const activeSection = ref<PortalSection>("logs");
const configMode = ref<ConfigMode>("create");
const themeMode = ref<ThemeMode>("light");

const navItems: NavItem[] = [
  { id: "fleet", label: "Fleet", shortLabel: "FL" },
  { id: "config", label: "Config", shortLabel: "CF" },
  { id: "logs", label: "Logs", shortLabel: "LG" },
  { id: "tools", label: "Tools", shortLabel: "TL" },
  { id: "profiles", label: "Profiles", shortLabel: "PR" },
];

const levelOptions: LevelOption[] = [
  { label: "All Levels", value: "all" },
  { label: "Info", value: "info" },
  { label: "Debug", value: "debug" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
];

const createErrors = ref<Record<string, string>>({});
const createNotice = ref("");

function blankForm(): FormState {
  return {
    id: "",
    name: "",
    toolPrefix: "",
    transport: "stdio",
    command: "",
    argsText: "",
    cwd: "",
    url: "",
    enabled: true,
    autoStart: true,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS,
  };
}

const createForm = reactive<FormState>(blankForm());

function resetCreateForm(): void {
  Object.assign(createForm, blankForm());
  createNotice.value = "";
  createErrors.value = {};
}

function resetConfigForm(): void {
  createNotice.value = "";
  createErrors.value = {};

  if (configMode.value === "edit" && selectedDefinition.value) {
    fillFormFromDefinition(selectedDefinition.value);
    return;
  }

  resetCreateForm();
}

function fillFormFromDefinition(definition: ManagedMcpDefinition): void {
  Object.assign(createForm, {
    id: definition.id,
    name: definition.name,
    toolPrefix: definition.toolPrefix,
    transport: definition.transport,
    command: definition.transport === "stdio" ? definition.command : "",
    argsText:
      definition.transport === "stdio" ? definition.args.join("\n") : "",
    cwd: definition.transport === "stdio" ? (definition.cwd ?? "") : "",
    url: definition.transport === "streamable-http" ? definition.url : "",
    enabled: definition.enabled,
    autoStart: definition.autoStart,
    startupTimeoutMs: definition.startupTimeoutMs,
  });
  createErrors.value = {};
}

function clearCreateError(field: string): void {
  if (!createErrors.value[field] && !createErrors.value.form) {
    return;
  }

  const nextErrors = { ...createErrors.value };
  delete nextErrors[field];
  delete nextErrors.form;
  createErrors.value = nextErrors;
}

function formatClock(timestamp: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(timestamp));
}

function formatRelativeTime(timestamp: string): string {
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

function titleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function sourceLabel(source: ManagedMcpLogEntry["source"]): string {
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

function parseLogMessage(entry: ManagedMcpLogEntry): {
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

function statusRatio(snapshot: ManagedMcpSnapshot | null): number {
  if (!snapshot) {
    return 0;
  }

  switch (snapshot.status) {
    case "ready":
      return 1;
    case "starting":
      return 0.74;
    case "degraded":
      return 0.58;
    case "stopping":
      return 0.42;
    case "error":
      return 0.24;
    case "stopped":
      return 0.16;
    default:
      return 0;
  }
}

function stoplightRatio(value: number): number {
  return Math.max(0.08, Math.min(1, value));
}

async function handleServiceChange(nextId: string): Promise<void> {
  if (!nextId) {
    return;
  }

  await select(nextId);

  if (activeSection.value === "config") {
    setConfigMode("edit");
  }
}

function toggleStream(): void {
  setStreamPaused(!streamPaused.value);
}

function exportConfig(): void {
  if (!import.meta.client || !selected.value) {
    return;
  }

  const payload = JSON.stringify(selected.value.definition, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${selected.value.definition.id}-config.json`;
  link.click();

  URL.revokeObjectURL(url);
}

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "");
}

function syncIdentifiers(field: "id" | "name", value: string): void {
  createNotice.value = "";
  clearCreateError(field);

  if (field === "id") {
    createForm.id = normalizeIdentifier(value);
    if (!createForm.toolPrefix) {
      createForm.toolPrefix = createForm.id;
    }
    return;
  }

  createForm.name = value;
}

function handleIdInput(value: string): void {
  syncIdentifiers("id", value);
}

function handleNameInput(value: string): void {
  syncIdentifiers("name", value);
}

function setTransport(transport: ManagedMcpDefinition["transport"]): void {
  createNotice.value = "";
  createForm.transport = transport;
  clearCreateError("transport");

  if (transport === "stdio") {
    clearCreateError("url");
    return;
  }

  clearCreateError("command");
}

function setConfigMode(mode: ConfigMode): void {
  createNotice.value = "";
  configMode.value = mode;

  if (mode === "edit") {
    if (selectedDefinition.value) {
      fillFormFromDefinition(selectedDefinition.value);
    }
    return;
  }

  resetCreateForm();
}

function applyTheme(theme: ThemeMode): void {
  themeMode.value = theme;

  if (!import.meta.client) {
    return;
  }

  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("mcp-portal-theme", theme);
}

function toggleTheme(): void {
  applyTheme(themeMode.value === "light" ? "dark" : "light");
}

function buildDefinitionFromForm(): ManagedMcpDefinition | null {
  const candidate: ManagedMcpDefinition =
    createForm.transport === "stdio"
      ? {
          id:
            configMode.value === "edit"
              ? (selectedDefinition.value?.id ?? createForm.id.trim())
              : createForm.id.trim(),
          name: createForm.name.trim(),
          enabled: createForm.enabled,
          autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: "stdio",
          command: createForm.command.trim(),
          args: createForm.argsText
            .split("\n")
            .map((value) => value.trim())
            .filter(Boolean),
          cwd: createForm.cwd.trim() || undefined,
          env: [],
        }
      : {
          id: createForm.id.trim(),
          name: createForm.name.trim(),
          enabled: createForm.enabled,
          autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: "streamable-http",
          url: createForm.url.trim(),
          headers: [],
        };

  const parsed = managedMcpDefinitionSchema.safeParse(candidate);
  if (parsed.success) {
    createErrors.value = {};
    return parsed.data;
  }

  const nextErrors: Record<string, string> = {};

  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "form");
    if (!nextErrors[field]) {
      nextErrors[field] = issue.message;
    }
  }

  createErrors.value = nextErrors;
  return null;
}

async function submitCreateForm(): Promise<void> {
  createNotice.value = "";

  const definition = buildDefinitionFromForm();
  if (!definition) {
    return;
  }

  try {
    const snapshot =
      configMode.value === "edit" && selectedDefinition.value
        ? await updateDefinition(selectedDefinition.value.id, definition)
        : await createDefinition(definition);

    if (configMode.value === "create") {
      resetCreateForm();
    } else {
      fillFormFromDefinition(snapshot.definition);
    }

    createNotice.value =
      configMode.value === "edit"
        ? `${snapshot.definition.name} updated successfully.`
        : `${snapshot.definition.name} added to the fleet.`;
    activeSection.value = "config";
  } catch (error) {
    createErrors.value = {
      ...createErrors.value,
      form: error instanceof Error ? error.message : "Could not save the MCP.",
    };
  }
}

const selectedSnapshot = computed(() => selected.value);
const selectedDefinition = computed(
  () => selectedSnapshot.value?.definition ?? null,
);
const selectedPidLabel = computed(() => {
  if (!selectedSnapshot.value) {
    return "No session";
  }

  if (selectedSnapshot.value.pid) {
    return `PID: ${selectedSnapshot.value.pid}`;
  }

  return selectedDefinition.value?.transport === "streamable-http"
    ? "Remote target"
    : "Awaiting process";
});

const logCounts = computed(() =>
  rawLogs.value.reduce(
    (counts, entry) => {
      counts[entry.level] += 1;
      return counts;
    },
    {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
    },
  ),
);

const filteredLogRows = computed<ConsoleLogRow[]>(() =>
  logs.value.map((entry) => {
    const parsed = parseLogMessage(entry);

    return {
      id: entry.id,
      level: entry.level,
      time: formatClock(entry.timestamp),
      category: parsed.category,
      message: parsed.message,
    };
  }),
);

const bufferFreePercent = computed(() =>
  Math.max(0, 100 - Math.round((rawLogs.value.length / TOTAL_LOG_LIMIT) * 100)),
);

const healthMetrics = computed<HealthMetric[]>(() => {
  const totalEntries = rawLogs.value.length || 1;
  const flaggedEntries = logCounts.value.warn + logCounts.value.error;

  return [
    {
      label: "Status",
      value: selectedSnapshot.value
        ? titleCase(selectedSnapshot.value.status)
        : "Offline",
      ratio: statusRatio(selectedSnapshot.value),
      tone: "primary",
    },
    {
      label: "Signal",
      value: `${flaggedEntries} flagged`,
      ratio: stoplightRatio(flaggedEntries / totalEntries),
      tone: "secondary",
    },
    {
      label: "Buffer",
      value: `${rawLogs.value.length}/${TOTAL_LOG_LIMIT}`,
      ratio: rawLogs.value.length / TOTAL_LOG_LIMIT,
      tone: "tertiary",
    },
  ];
});

const metadataTags = computed<MetadataTag[]>(() => {
  if (!selectedDefinition.value) {
    return [];
  }

  return [
    { label: "service", value: selectedDefinition.value.name },
    { label: "transport", value: selectedDefinition.value.transport },
    { label: "prefix", value: selectedDefinition.value.toolPrefix },
    {
      label: "startup",
      value: `${Math.round(selectedDefinition.value.startupTimeoutMs / 1_000)}s`,
    },
    {
      label: "auto",
      value: selectedDefinition.value.autoStart ? "enabled" : "manual",
    },
  ];
});

const eventStreamItems = computed<EventStreamItem[]>(() =>
  rawLogs.value
    .slice()
    .reverse()
    .filter(
      (entry) =>
        entry.level !== "info" ||
        entry.source === "manager" ||
        entry.message.startsWith("["),
    )
    .slice(0, 4)
    .map((entry) => {
      const parsed = parseLogMessage(entry);

      return {
        id: `${entry.id}-${entry.timestamp}`,
        title: parsed.category,
        message: parsed.message,
        level: entry.level,
        relativeTime: formatRelativeTime(entry.timestamp),
      };
    }),
);

const configPreview = computed(() =>
  selectedDefinition.value
    ? JSON.stringify(selectedDefinition.value, null, 2)
    : "",
);
const selectedTools = computed(() => selectedSnapshot.value?.tools ?? []);

watch(
  () => selectedDefinition.value,
  (definition) => {
    if (configMode.value === "edit" && definition) {
      fillFormFromDefinition(definition);
    }
  },
  { immediate: true },
);

onMounted(() => {
  if (!import.meta.client) {
    return;
  }

  const savedTheme = window.localStorage.getItem("mcp-portal-theme");
  applyTheme(savedTheme === "dark" ? "dark" : "light");
});
</script>

<template>
  <div class="portal-shell">
    <PortalSidebar
      :active-section="activeSection"
      :caption="'Local runtime control for managed MCP instances and shared tool gateways.'"
      :nav-items="navItems"
      @navigate="activeSection = $event"
    />

    <main class="portal-main">
      <PortalTopbar
        v-model:search-query="searchQuery"
        :active-section="activeSection"
        :items="items"
        :selected-id="selectedId"
        :theme-mode="themeMode"
        @select-service="handleServiceChange"
        @toggle-theme="toggleTheme"
      />

      <LogsSection
        v-if="activeSection === 'logs'"
        :buffer-free-percent="bufferFreePercent"
        :event-stream-items="eventStreamItems"
        :filtered-log-rows="filteredLogRows"
        :health-metrics="healthMetrics"
        :level-options="levelOptions"
        :loading="loading"
        :metadata-tags="metadataTags"
        :raw-logs-length="rawLogs.length"
        :selected-definition="selectedDefinition"
        :selected-pid-label="selectedPidLabel"
        :selected-snapshot="selectedSnapshot"
        :stream-paused="streamPaused"
        :total-log-limit="TOTAL_LOG_LIMIT"
        v-model:level-filter="levelFilter"
        @export-config="exportConfig"
        @toggle-stream="toggleStream"
      />

      <FleetSection
        v-else-if="activeSection === 'fleet'"
        :actioning="actioning"
        :items="items"
        :selected-id="selectedId"
        @action="invokeAction"
        @select="select"
      />

      <ConfigSection
        v-else-if="activeSection === 'config'"
        :config-mode="configMode"
        :config-preview="configPreview"
        :create-errors="createErrors"
        :create-form="createForm"
        :create-notice="createNotice"
        :logs-length="logs.length"
        :saving="saving"
        :selected-definition="selectedDefinition"
        :selected-snapshot="selectedSnapshot"
        @clear-error="clearCreateError"
        @export-config="exportConfig"
        @id-input="handleIdInput"
        @mode-change="setConfigMode"
        @name-input="handleNameInput"
        @reset="resetConfigForm"
        @submit="submitCreateForm"
        @transport-change="setTransport"
      />

      <ProfilesSection
        v-else-if="activeSection === 'profiles'"
        :profiles="profilesDashboard.profiles.value"
        :active-profile-id="profilesDashboard.activeProfileId.value"
        :items="items"
        :saving="profilesDashboard.saving.value"
        @create="profilesDashboard.createProfile"
        @update="profilesDashboard.updateProfile"
        @delete="profilesDashboard.deleteProfile"
        @activate="profilesDashboard.activateProfile"
        @deactivate="profilesDashboard.deactivateProfile"
      />

      <ToolsSection
        v-else
        :selected-definition="selectedDefinition"
        :selected-tools="selectedTools"
      />
    </main>
  </div>
</template>
