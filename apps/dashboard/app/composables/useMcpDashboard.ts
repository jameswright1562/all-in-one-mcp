import type {
  ManagedMcpCollection,
  ManagedMcpDefinition,
  ManagedMcpEvent,
  ManagedMcpLogEntry,
  ManagedMcpSnapshot
} from '@all-in-one-mcp/contracts'

type LogLevelFilter = 'all' | ManagedMcpLogEntry['level']
type LogCollectionResponse = {
  items: ManagedMcpLogEntry[]
}

const LOG_LIMIT = 1_000
const EVENT_QUEUE_LIMIT = 500

function sortSnapshots(items: ManagedMcpSnapshot[]): ManagedMcpSnapshot[] {
  return [...items].sort((left, right) => left.definition.name.localeCompare(right.definition.name))
}

function upsertSnapshot(items: ManagedMcpSnapshot[], next: ManagedMcpSnapshot): ManagedMcpSnapshot[] {
  return sortSnapshots([...items.filter((item) => item.definition.id !== next.definition.id), next])
}

function matchesSearch(entry: ManagedMcpLogEntry, query: string): boolean {
  if (!query) {
    return true
  }

  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  return [entry.level, entry.source, entry.message, entry.timestamp].some((value) =>
    value.toLowerCase().includes(normalizedQuery)
  )
}

export function useMcpDashboard() {
  const items = ref<ManagedMcpSnapshot[]>([])
  const logCache = ref<Record<string, ManagedMcpLogEntry[]>>({})
  const selectedId = ref<string | null>(null)
  const searchQuery = ref('')
  const levelFilter = ref<LogLevelFilter>('all')
  const streamPaused = ref(false)
  const loading = ref(false)
  const actioning = ref(false)
  const saving = ref(false)
  const queuedEvents: ManagedMcpEvent[] = []
  let eventSource: EventSource | null = null

  const selected = computed(() => items.value.find((item) => item.definition.id === selectedId.value) ?? null)
  const rawLogs = computed(() => (selectedId.value ? logCache.value[selectedId.value] ?? [] : []))
  const logs = computed(() =>
    rawLogs.value.filter((entry) => (levelFilter.value === 'all' ? true : entry.level === levelFilter.value)).filter((entry) => matchesSearch(entry, searchQuery.value))
  )

  function setItems(nextItems: ManagedMcpSnapshot[]): void {
    items.value = sortSnapshots(nextItems)

    if (selectedId.value && items.value.some((item) => item.definition.id === selectedId.value)) {
      return
    }

    selectedId.value = items.value[0]?.definition.id ?? null
  }

  function setLogs(id: string, entries: ManagedMcpLogEntry[]): void {
    logCache.value = {
      ...logCache.value,
      [id]: entries.slice(-LOG_LIMIT)
    }
  }

  function appendLog(entry: ManagedMcpLogEntry): void {
    const existing = logCache.value[entry.mcpId] ?? []
    setLogs(entry.mcpId, [...existing, entry])
  }

  async function load(): Promise<void> {
    loading.value = true

    try {
      const response = await $fetch<ManagedMcpCollection>('/api/mcps')
      setItems(response.items)

      if (selectedId.value) {
        await loadLogs(selectedId.value)
      }
    } finally {
      loading.value = false
    }
  }

  async function loadLogs(id: string, force = false): Promise<void> {
    if (!force && logCache.value[id]) {
      return
    }

    const response = await $fetch<LogCollectionResponse>(`/api/mcps/${id}/logs`, {
      query: {
        limit: LOG_LIMIT
      }
    })

    setLogs(id, response.items)
  }

  async function select(id: string): Promise<void> {
    selectedId.value = id
    await loadLogs(id)
  }

  async function invokeAction(id: string, action: 'start' | 'stop' | 'restart'): Promise<void> {
    actioning.value = true

    try {
      const snapshot = await $fetch<ManagedMcpSnapshot>(`/api/mcps/${id}/${action}`, {
        method: 'POST'
      })

      items.value = upsertSnapshot(items.value, snapshot)
      await loadLogs(id, true)
    } finally {
      actioning.value = false
    }
  }

  async function createDefinition(definition: ManagedMcpDefinition): Promise<ManagedMcpSnapshot> {
    saving.value = true

    try {
      const snapshot = await $fetch<ManagedMcpSnapshot>('/api/mcps', {
        method: 'POST',
        body: definition
      })

      items.value = upsertSnapshot(items.value, snapshot)
      selectedId.value = snapshot.definition.id
      await loadLogs(snapshot.definition.id, true)
      return snapshot
    } finally {
      saving.value = false
    }
  }

  async function updateDefinition(id: string, definition: ManagedMcpDefinition): Promise<ManagedMcpSnapshot> {
    saving.value = true

    try {
      const snapshot = await $fetch<ManagedMcpSnapshot>(`/api/mcps/${id}`, {
        method: 'PATCH',
        body: definition
      })

      items.value = upsertSnapshot(items.value, snapshot)
      selectedId.value = snapshot.definition.id
      await loadLogs(snapshot.definition.id, true)
      return snapshot
    } finally {
      saving.value = false
    }
  }

  function applyEvent(payload: ManagedMcpEvent): void {
    if (streamPaused.value) {
      if (queuedEvents.length >= EVENT_QUEUE_LIMIT) {
        queuedEvents.shift()
      }

      queuedEvents.push(payload)
      return
    }

    if (payload.type === 'snapshot') {
      items.value = upsertSnapshot(items.value, payload.snapshot)

      if (!selectedId.value) {
        selectedId.value = payload.snapshot.definition.id
      }

      return
    }

    if (payload.type === 'log') {
      appendLog(payload.entry)
      return
    }

    items.value = items.value.filter((item) => item.definition.id !== payload.mcpId)

    if (payload.mcpId in logCache.value) {
      const nextCache = { ...logCache.value }
      delete nextCache[payload.mcpId]
      logCache.value = nextCache
    }

    if (selectedId.value === payload.mcpId) {
      selectedId.value = items.value[0]?.definition.id ?? null
      if (selectedId.value) {
        void loadLogs(selectedId.value)
      }
    }
  }

  function flushQueuedEvents(): void {
    while (queuedEvents.length > 0) {
      const payload = queuedEvents.shift()
      if (payload) {
        applyEvent(payload)
      }
    }
  }

  function setStreamPaused(nextValue: boolean): void {
    streamPaused.value = nextValue
    if (!nextValue) {
      flushQueuedEvents()
    }
  }

  function connectEvents(): void {
    if (!import.meta.client || eventSource) {
      return
    }

    eventSource = new EventSource('/api/events')

    eventSource.addEventListener('ready', async (event) => {
      const payload = JSON.parse((event as MessageEvent<string>).data) as ManagedMcpCollection
      setItems(payload.items)

      if (selectedId.value) {
        await loadLogs(selectedId.value)
      }
    })

    for (const eventName of ['snapshot', 'log', 'removed']) {
      eventSource.addEventListener(eventName, (event) => {
        applyEvent(JSON.parse((event as MessageEvent<string>).data) as ManagedMcpEvent)
      })
    }
  }

  watch(
    selectedId,
    (id) => {
      if (id) {
        void loadLogs(id)
      }
    },
    { immediate: false }
  )

  onMounted(async () => {
    await load()
    connectEvents()
  })

  onBeforeUnmount(() => {
    eventSource?.close()
    eventSource = null
  })

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
    setStreamPaused
  }
}
