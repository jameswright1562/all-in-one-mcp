import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  ManagedMcpCollection,
  ManagedMcpDefinition,
  ManagedMcpEvent,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot,
} from "all-in-one-mcp/contracts";
import type { ProfileCollection, ProfileEvent } from "all-in-one-mcp/contracts";
import { createRuntimeEventSource, requestJson } from "@/lib/runtimeApi";

type LogLevelFilter = "all" | ManagedMcpLogEntry["level"];
type LogCollectionResponse = {
  items: ManagedMcpLogEntry[];
};

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

export function useMcpDashboard() {
  const items = ref<ManagedMcpSnapshot[]>([]);
  const logCache = ref<Record<string, ManagedMcpLogEntry[]>>({});
  const selectedId = ref<string | null>(null);
  const showAll = ref(true);
  const searchQuery = ref("");
  const levelFilter = ref<LogLevelFilter>("all");
  const streamPaused = ref(false);
  const loading = ref(false);
  const actioning = ref(false);
  const saving = ref(false);
  const queuedEvents: ManagedMcpEvent[] = [];
  let eventSource: EventSource | null = null;
  let profileEventCallback: ((event: ProfileEvent) => void) | null = null;
  let profilesReadyCallback: ((collection: ProfileCollection) => void) | null =
    null;

  const selected = computed(() =>
    showAll.value
      ? null
      : (items.value.find(
          (item: { definition: { id: any } }) =>
            item.definition.id === selectedId.value,
        ) ?? null),
  );
  const rawLogs = computed(() => {
    if (showAll.value) {
      return Object.values(logCache.value)
        .flat()
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
    }
    return selectedId.value ? (logCache.value[selectedId.value] ?? []) : [];
  });
  const logs = computed(() =>
    rawLogs.value
      .filter((entry: { level: any }) =>
        levelFilter.value === "all" ? true : entry.level === levelFilter.value,
      )
      .filter(
        (entry: {
          id: number;
          mcpId: string;
          level: "error" | "debug" | "info" | "warn";
          source: "manager" | "stdout" | "stderr" | "transport" | "upstream";
          message: string;
          timestamp: string;
        }) => matchesSearch(entry, searchQuery.value),
      ),
  );

  function setItems(nextItems: ManagedMcpSnapshot[]): void {
    items.value = sortSnapshots(nextItems);

    if (
      selectedId.value &&
      items.value.some(
        (item: { definition: { id: any } }) =>
          item.definition.id === selectedId.value,
      )
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
      const response = await requestJson<ManagedMcpCollection>("/api/mcps", {
        method: "GET",
      });
      setItems(response.items);

      if (selectedId.value) {
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

    const response = await requestJson<LogCollectionResponse>(
      `/api/mcps/${id}/logs`,
      {
        method: "GET",
      },
      {
        limit: LOG_LIMIT,
      },
    );

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
    action: "start" | "stop" | "restart",
  ): Promise<void> {
    actioning.value = true;

    try {
      const snapshot = await requestJson<ManagedMcpSnapshot>(
        `/api/mcps/${id}/${action}`,
        {
          method: "POST",
        },
      );

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
      const snapshot = await requestJson<ManagedMcpSnapshot>("/api/mcps", {
        method: "POST",
        body: JSON.stringify(definition),
      });

      items.value = upsertSnapshot(items.value, snapshot);
      selectedId.value = snapshot.definition.id;
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
      const snapshot = await requestJson<ManagedMcpSnapshot>(
        `/api/mcps/${id}`,
        {
          method: "PATCH",
          body: JSON.stringify(definition),
        },
      );

      items.value = upsertSnapshot(items.value, snapshot);
      selectedId.value = snapshot.definition.id;
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

      if (!selectedId.value) {
        selectedId.value = payload.snapshot.definition.id;
      }

      return;
    }

    if (payload.type === "log") {
      appendLog(payload.entry);
      return;
    }

    items.value = items.value.filter(
      (item: { definition: { id: string } }) =>
        item.definition.id !== payload.mcpId,
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

  function connectEvents(): void {
    if (typeof window === "undefined" || eventSource) {
      return;
    }

    eventSource = createRuntimeEventSource("/api/events");

    eventSource.addEventListener("ready", async (event) => {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as ManagedMcpCollection;
      setItems(payload.items);

      if (selectedId.value) {
        await loadLogs(selectedId.value);
      }
    });

    for (const eventName of ["snapshot", "log", "removed"]) {
      eventSource.addEventListener(eventName, (event) => {
        applyEvent(
          JSON.parse((event as MessageEvent<string>).data) as ManagedMcpEvent,
        );
      });
    }

    eventSource.addEventListener("profiles-ready", (event) => {
      const payload = JSON.parse(
        (event as MessageEvent<string>).data,
      ) as ProfileCollection;
      profilesReadyCallback?.(payload);
    });

    for (const eventName of [
      "profile-snapshot",
      "profile-removed",
      "profile-activated",
    ]) {
      eventSource.addEventListener(eventName, (event) => {
        const payload = JSON.parse(
          (event as MessageEvent<string>).data,
        ) as ProfileEvent;
        profileEventCallback?.(payload);
      });
    }
  }

  watch(
    selectedId,
    (id: string) => {
      if (id) {
        void loadLogs(id);
      }
    },
    { immediate: false },
  );

  onMounted(async () => {
    await load();
    connectEvents();
  });

  onBeforeUnmount(() => {
    eventSource?.close();
    eventSource = null;
  });

  function onProfileEvent(callback: (event: ProfileEvent) => void): void {
    profileEventCallback = callback;
  }

  function onProfilesReady(
    callback: (collection: ProfileCollection) => void,
  ): void {
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
