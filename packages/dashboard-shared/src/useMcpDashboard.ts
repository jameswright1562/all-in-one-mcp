import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  ManagedMcpCollection,
  ManagedMcpDefinition,
  ManagedMcpEvent,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot,
} from "all-in-one-mcp/contracts";

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

export type DashboardConfig = {
  fetchMcps(): Promise<ManagedMcpSnapshot[]>;
  fetchLogs(mcpId: string): Promise<ManagedMcpLogEntry[]>;
  createEventSource(): EventSource | { close(): void; onmessage: (e: MessageEvent) => void };
  onAction(action: string, mcpId: string, body?: any): Promise<any>;
  createDefinition(def: ManagedMcpDefinition): Promise<ManagedMcpSnapshot>;
  updateDefinition(id: string, def: ManagedMcpDefinition): Promise<ManagedMcpSnapshot>;
};

export function useMcpDashboard(config: DashboardConfig) {
  const items = ref<ManagedMcpSnapshot[]>([]);
  const logCache = ref<Record<string, ManagedMcpLogEntry[]>>({});
  const selectedId = ref<string | null>(null);
  const searchQuery = ref("");
  const levelFilter = ref<LogLevelFilter>("all");
  const streamPaused = ref(false);
  const loading = ref(false);
  const actioning = ref(false);
  const saving = ref(false);
  const queuedEvents: ManagedMcpEvent[] = [];
  let eventSource: EventSource | null = null;

  const selected = computed(
    () => items.value.find((i) => i.definition.id === selectedId.value) ?? null,
  );
  const rawLogs = computed(() =>
    selectedId.value ? (logCache.value[selectedId.value] ?? []) : [],
  );
  const logs = computed(() =>
    rawLogs.value
      .filter((e) => levelFilter.value === "all" ? true : e.level === levelFilter.value)
      .filter((e) => matchesSearch(e, searchQuery.value)),
  );

  function setItems(nextItems: ManagedMcpSnapshot[]): void {
    items.value = sortSnapshots(nextItems);
    if (selectedId.value && items.value.some((i) => i.definition.id === selectedId.value)) {
      return;
    }
    selectedId.value = items.value[0]?.definition.id ?? null;
  }

  function setLogs(id: string, entries: ManagedMcpLogEntry[]): void {
    logCache.value = { ...logCache.value, [id]: entries.slice(-LOG_LIMIT) };
  }

  function appendLog(entry: ManagedMcpLogEntry): void {
    const existing = logCache.value[entry.mcpId] ?? [];
    setLogs(entry.mcpId, [...existing, entry]);
  }

  async function load(): Promise<void> {
    loading.value = true;
    try {
      const snapshots = await config.fetchMcps();
      setItems(snapshots);
      if (selectedId.value) {
        await loadLogs(selectedId.value);
      }
    } finally {
      loading.value = false;
    }
  }

  async function loadLogs(id: string, force = false): Promise<void> {
    if (!force && logCache.value[id]) return;
    const entries = await config.fetchLogs(id);
    setLogs(id, entries);
  }

  async function select(id: string): Promise<void> {
    selectedId.value = id;
    await loadLogs(id);
  }

  async function invokeAction(id: string, action: string): Promise<void> {
    actioning.value = true;
    try {
      const snapshot = await config.onAction(action, id);
      items.value = upsertSnapshot(items.value, snapshot);
      await loadLogs(id, true);
    } finally {
      actioning.value = false;
    }
  }

  async function createDefinition(def: ManagedMcpDefinition): Promise<ManagedMcpSnapshot> {
    saving.value = true;
    try {
      const snapshot = await config.createDefinition(def);
      items.value = upsertSnapshot(items.value, snapshot);
      selectedId.value = snapshot.definition.id;
      await loadLogs(snapshot.definition.id, true);
      return snapshot;
    } finally {
      saving.value = false;
    }
  }

  async function updateDefinition(id: string, def: ManagedMcpDefinition): Promise<ManagedMcpSnapshot> {
    saving.value = true;
    try {
      const snapshot = await config.updateDefinition(id, def);
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
      if (queuedEvents.length >= EVENT_QUEUE_LIMIT) queuedEvents.shift();
      queuedEvents.push(payload);
      return;
    }
    if (payload.type === "snapshot") {
      items.value = upsertSnapshot(items.value, payload.snapshot);
      if (!selectedId.value) selectedId.value = payload.snapshot.definition.id;
      return;
    }
    if (payload.type === "log") {
      appendLog(payload.entry);
      return;
    }
    items.value = items.value.filter((i) => i.definition.id !== payload.mcpId);
    if (payload.mcpId in logCache.value) {
      const nextCache = { ...logCache.value };
      delete nextCache[payload.mcpId];
      logCache.value = nextCache;
    }
    if (selectedId.value === payload.mcpId) {
      selectedId.value = items.value[0]?.definition.id ?? null;
      if (selectedId.value) void loadLogs(selectedId.value);
    }
  }

  function flushQueuedEvents(): void {
    while (queuedEvents.length) {
      const p = queuedEvents.shift();
      if (p) applyEvent(p);
    }
  }

  function setStreamPaused(v: boolean): void {
    streamPaused.value = v;
    if (!v) flushQueuedEvents();
  }

  function connectEvents(): void {
    if (eventSource) return;
    const src = config.createEventSource();
    eventSource = src as EventSource;
    // Assuming the provided source follows EventSource interface
    (eventSource as any).addEventListener("ready", async (e: MessageEvent) => {
      const payload = JSON.parse(e.data) as ManagedMcpCollection;
      setItems(payload.items);
      if (selectedId.value) await loadLogs(selectedId.value);
    });
    for (const name of ["snapshot", "log", "removed"] as const) {
      (eventSource as any).addEventListener(name, (e: MessageEvent) => {
        applyEvent(JSON.parse(e.data) as ManagedMcpEvent);
      });
    }
  }

  watch(selectedId, (id) => {
    if (id) void loadLogs(id);
  });

  onMounted(async () => {
    await load();
    connectEvents();
  });

  onBeforeUnmount(() => {
    eventSource?.close();
    eventSource = null;
  });

  return {
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
    load,
    loadLogs,
    select,
    invokeAction,
    createDefinition,
    updateDefinition,
    setStreamPaused,
  };
}
