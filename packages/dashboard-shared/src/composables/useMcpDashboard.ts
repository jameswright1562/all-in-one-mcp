import { computed, onMounted, ref, watch } from "vue";
import type {
  ManagedMcpCollection,
  ManagedMcpDefinition,
  ManagedMcpEvent,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot,
  ProfileCollection,
  ProfileEvent,
} from "@all-in-one-mcp/contracts";
import type { DashboardAction, DashboardClient } from "./useDashboardClient";
import { useEventStream } from "./useEventStream";

type LogLevelFilter = "all" | ManagedMcpLogEntry["level"];
type ProfileEventCallback = (event: ProfileEvent) => void;
type ProfilesReadyCallback = (collection: ProfileCollection) => void;

const LOG_LIMIT = 1_000;
const EVENT_QUEUE_LIMIT = 500;

function sortSnapshots(items: ManagedMcpSnapshot[]): ManagedMcpSnapshot[] {
  return [...items].sort((left, right) =>
    left.definition.name.localeCompare(right.definition.name),
  );
}

function upsertSnapshot(
  items: ManagedMcpSnapshot[],
  next: ManagedMcpSnapshot,
): ManagedMcpSnapshot[] {
  return sortSnapshots([
    ...items.filter((item) => item.definition.id !== next.definition.id),
    next,
  ]);
}

function matchesSearch(entry: ManagedMcpLogEntry, query: string): boolean {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return [entry.level, entry.source, entry.message, entry.timestamp].some(
    (value) => value.toLowerCase().includes(normalizedQuery),
  );
}

export function useMcpDashboard(
  client: DashboardClient,
  options: { showAllByDefault?: boolean } = {},
) {
  const items = ref<ManagedMcpSnapshot[]>([]);
  const logCache = ref<Record<string, ManagedMcpLogEntry[]>>({});
  const selectedId = ref<string | null>(null);
  const showAll = ref(options.showAllByDefault ?? true);
  const searchQuery = ref("");
  const levelFilter = ref<LogLevelFilter>("all");
  const streamPaused = ref(false);
  const loading = ref(false);
  const actioning = ref(false);
  const saving = ref(false);
  const queuedEvents: ManagedMcpEvent[] = [];
  let profileEventCallback: ProfileEventCallback | null = null;
  let profilesReadyCallback: ProfilesReadyCallback | null = null;

  const selected = computed(() =>
    showAll.value
      ? null
      : (items.value.find((item) => item.definition.id === selectedId.value) ??
        null),
  );
  const rawLogs = computed(() => {
    if (showAll.value) {
      return Object.values(logCache.value)
        .flat()
        .sort((left, right) => left.timestamp.localeCompare(right.timestamp));
    }

    return selectedId.value ? (logCache.value[selectedId.value] ?? []) : [];
  });
  const logs = computed(() =>
    rawLogs.value
      .filter((entry) =>
        levelFilter.value === "all" ? true : entry.level === levelFilter.value,
      )
      .filter((entry) => matchesSearch(entry, searchQuery.value)),
  );

  function setItems(nextItems: ManagedMcpSnapshot[]): void {
    items.value = sortSnapshots(nextItems);

    if (
      selectedId.value &&
      items.value.some((item) => item.definition.id === selectedId.value)
    ) {
      return;
    }

    if (!showAll.value) {
      selectedId.value = items.value[0]?.definition.id ?? null;
    }
  }

  function setLogs(id: string, entries: ManagedMcpLogEntry[]): void {
    logCache.value = {
      ...logCache.value,
      [id]: entries.slice(-LOG_LIMIT),
    };
  }

  function appendLog(entry: ManagedMcpLogEntry): void {
    const existing = logCache.value[entry.mcpId] ?? [];
    setLogs(entry.mcpId, [...existing, entry]);
  }

  async function load(): Promise<void> {
    loading.value = true;

    try {
      const response = await client.fetchMcps();
      setItems(response.items);

      if (!showAll.value && selectedId.value) {
        await loadLogs(selectedId.value);
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadLogs(id: string, force = false): Promise<void> {
    if (!force && logCache.value[id]) {
      return;
    }

    const response = await client.fetchLogs(id, LOG_LIMIT);
    setLogs(id, response.items);
  }

  async function select(id: string): Promise<void> {
    showAll.value = false;
    selectedId.value = id;
    await loadLogs(id);
  }

  function selectAll(): void {
    showAll.value = true;
    selectedId.value = null;
  }

  async function invokeAction(
    id: string,
    action: DashboardAction,
  ): Promise<void> {
    actioning.value = true;

    try {
      const snapshot = await client.mutateMcp(id, action);
      items.value = upsertSnapshot(items.value, snapshot);
      await loadLogs(id, true);
    } finally {
      actioning.value = false;
    }
  }

  async function createDefinition(
    definition: ManagedMcpDefinition,
  ): Promise<ManagedMcpSnapshot> {
    saving.value = true;

    try {
      const snapshot = await client.createDefinition(definition);
      items.value = upsertSnapshot(items.value, snapshot);
      selectedId.value = snapshot.definition.id;
      showAll.value = false;
      await loadLogs(snapshot.definition.id, true);
      return snapshot;
    } finally {
      saving.value = false;
    }
  }

  async function updateDefinition(
    id: string,
    definition: ManagedMcpDefinition,
  ): Promise<ManagedMcpSnapshot> {
    saving.value = true;

    try {
      const snapshot = await client.updateDefinition(id, definition);
      items.value = upsertSnapshot(items.value, snapshot);
      selectedId.value = snapshot.definition.id;
      showAll.value = false;
      await loadLogs(snapshot.definition.id, true);
      return snapshot;
    } finally {
      saving.value = false;
    }
  }

  function applyEvent(payload: ManagedMcpEvent): void {
    if (streamPaused.value) {
      if (queuedEvents.length >= EVENT_QUEUE_LIMIT) {
        queuedEvents.shift();
      }

      queuedEvents.push(payload);
      return;
    }

    if (payload.type === "snapshot") {
      items.value = upsertSnapshot(items.value, payload.snapshot);

      if (!selectedId.value && !showAll.value) {
        selectedId.value = payload.snapshot.definition.id;
      }

      return;
    }

    if (payload.type === "log") {
      appendLog(payload.entry);
      return;
    }

    items.value = items.value.filter(
      (item) => item.definition.id !== payload.mcpId,
    );

    if (payload.mcpId in logCache.value) {
      const nextCache = { ...logCache.value };
      delete nextCache[payload.mcpId];
      logCache.value = nextCache;
    }

    if (selectedId.value === payload.mcpId) {
      selectedId.value = items.value[0]?.definition.id ?? null;
      if (selectedId.value) {
        void loadLogs(selectedId.value);
      }
    }
  }

  function flushQueuedEvents(): void {
    while (queuedEvents.length > 0) {
      const payload = queuedEvents.shift();
      if (payload) {
        applyEvent(payload);
      }
    }
  }

  function setStreamPaused(nextValue: boolean): void {
    streamPaused.value = nextValue;
    if (!nextValue) {
      flushQueuedEvents();
    }
  }

  const eventStream = useEventStream(client.createEventSource, {
    ready: async (event) => {
      const payload = JSON.parse(event.data) as ManagedMcpCollection;
      setItems(payload.items);

      if (!showAll.value && selectedId.value) {
        await loadLogs(selectedId.value);
      }
    },
    snapshot: (event) => {
      applyEvent(JSON.parse(event.data) as ManagedMcpEvent);
    },
    log: (event) => {
      applyEvent(JSON.parse(event.data) as ManagedMcpEvent);
    },
    removed: (event) => {
      applyEvent(JSON.parse(event.data) as ManagedMcpEvent);
    },
    "profiles-ready": (event) => {
      profilesReadyCallback?.(JSON.parse(event.data) as ProfileCollection);
    },
    "profile-snapshot": (event) => {
      profileEventCallback?.(JSON.parse(event.data) as ProfileEvent);
    },
    "profile-removed": (event) => {
      profileEventCallback?.(JSON.parse(event.data) as ProfileEvent);
    },
    "profile-activated": (event) => {
      profileEventCallback?.(JSON.parse(event.data) as ProfileEvent);
    },
  });

  watch(
    selectedId,
    (id) => {
      if (id && !showAll.value) {
        void loadLogs(id);
      }
    },
    { immediate: false },
  );

  onMounted(async () => {
    await load();
    eventStream.connect();
  });

  function onProfileEvent(callback: ProfileEventCallback): void {
    profileEventCallback = callback;
  }

  function onProfilesReady(callback: ProfilesReadyCallback): void {
    profilesReadyCallback = callback;
  }

  return {
    items,
    logs,
    rawLogs,
    selected,
    selectedId,
    showAll,
    searchQuery,
    levelFilter,
    streamPaused,
    loading,
    actioning,
    saving,
    load,
    loadLogs,
    select,
    selectAll,
    invokeAction,
    createDefinition,
    updateDefinition,
    setStreamPaused,
    onProfileEvent,
    onProfilesReady,
  };
}
