<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type { ManagedMcpDefinition } from "@all-in-one-mcp/contracts";
import ConfigSection from "./components/ConfigSection.vue";
import FleetSection from "./components/FleetSection.vue";
import LogsSection from "./components/LogsSection.vue";
import PortalSidebar from "./components/PortalSidebar.vue";
import PortalTopbar from "./components/PortalTopbar.vue";
import ProfilesSection from "./components/ProfilesSection.vue";
import SettingsSection from "./components/SettingsSection.vue";
import ToolsSection from "./components/ToolsSection.vue";
import { useMcpDashboard } from "./composables/useMcpDashboard";
import { useMcpForm } from "./composables/useMcpForm";
import { useProfilesDashboard } from "./composables/useProfilesDashboard";
import type {
  DashboardClient,
  SettingsAdapter,
} from "./composables/useDashboardClient";
import type {
  ConfigMode,
  ConsoleLogRow,
  EventStreamItem,
  HealthMetric,
  LevelOption,
  MetadataTag,
  NavItem,
  PortalSection,
  ThemeMode,
} from "./types/dashboard";
import {
  formatClock,
  formatRelativeTime,
  parseLogMessage,
  statusRatio,
  stoplightRatio,
  titleCase,
} from "./utils/formatters";

const props = defineProps<{
  client: DashboardClient;
  settingsAdapter?: SettingsAdapter | null;
  showAllByDefault?: boolean;
}>();

const TOTAL_LOG_LIMIT = 1_000;

const dashboard = useMcpDashboard(props.client, {
  showAllByDefault: props.showAllByDefault,
});
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
  selectAll,
  invokeAction,
  createDefinition,
  updateDefinition,
  setStreamPaused,
} = dashboard;

const profilesDashboard = useProfilesDashboard(props.client);

dashboard.onProfileEvent((event) => {
  profilesDashboard.applyEvent(event);
});
dashboard.onProfilesReady((collection) => {
  profilesDashboard.setProfiles(collection);
});

const activeSection = ref<PortalSection>("logs");
const configMode = ref<ConfigMode>("create");
const themeMode = ref<ThemeMode>("light");

const navItems = computed<NavItem[]>(() => {
  const base: NavItem[] = [
    { id: "logs", label: "Logs", shortLabel: "LG" },
    { id: "fleet", label: "Fleet", shortLabel: "FL" },
    { id: "profiles", label: "Profiles", shortLabel: "PR" },
    { id: "config", label: "Config", shortLabel: "CF" },
    { id: "tools", label: "Tools", shortLabel: "TL" },
  ];

  if (props.settingsAdapter) {
    base.push({ id: "settings", label: "Settings", shortLabel: "ST" });
  }

  return base;
});

const levelOptions: LevelOption[] = [
  { label: "All Levels", value: "all" },
  { label: "Info", value: "info" },
  { label: "Debug", value: "debug" },
  { label: "Warn", value: "warn" },
  { label: "Error", value: "error" },
];

const selectedSnapshot = computed(() => selected.value);
const selectedDefinition = computed<ManagedMcpDefinition | null>(
  () => selectedSnapshot.value?.definition ?? null,
);

const form = useMcpForm(configMode, selectedDefinition);
const {
  createForm,
  createErrors,
  createNotice,
  resetCreateForm,
  resetConfigForm,
  fillFormFromDefinition,
  clearCreateError,
  handleIdInput,
  handleNameInput,
  setTransport,
  buildDefinitionFromForm,
} = form;

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
const selectedTools = computed(() =>
  (selectedSnapshot.value?.tools ?? []).map((tool) => ({
    name: tool.name,
    upstreamName: tool.upstreamName,
    title: tool.title,
    description: tool.description,
  })),
);

async function handleServiceChange(nextId: string): Promise<void> {
  if (!nextId) {
    selectAll();
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
  if (typeof window === "undefined" || !selected.value) {
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

  if (typeof window === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = theme;
  window.localStorage.setItem("mcp-portal-theme", theme);
}

function toggleTheme(): void {
  applyTheme(themeMode.value === "light" ? "dark" : "light");
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
  if (typeof window === "undefined") {
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
        v-model:level-filter="levelFilter"
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

      <SettingsSection
        v-else-if="activeSection === 'settings' && settingsAdapter"
        :adapter="settingsAdapter"
      />

      <ToolsSection
        v-else
        :selected-definition="selectedDefinition"
        :selected-tools="selectedTools"
      />
    </main>
  </div>
</template>
