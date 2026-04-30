<script setup lang="ts">
import {
  DEFAULT_STARTUP_TIMEOUT_MS,
  managedMcpDefinitionSchema,
  type KeyValuePair,
  type ManagedMcpDefinition,
  type ManagedMcpLogEntry,
  type ManagedMcpSnapshot
} from 'all-in-one-mcp/contracts'
import { useMcpDashboard } from './composables/useMcpDashboard'

type PortalSection = 'logs' | 'fleet' | 'config' | 'tools'
type ConfigMode = 'create' | 'edit'
type ThemeMode = 'light' | 'dark'
type HealthMetricTone = 'primary' | 'secondary' | 'tertiary'

type HealthMetric = {
  label: string
  value: string
  ratio: number
  tone: HealthMetricTone
}

type MetadataTag = {
  label: string
  value: string
}

type EventStreamItem = {
  id: string
  title: string
  message: string
  level: ManagedMcpLogEntry['level']
  relativeTime: string
}

type ConsoleLogRow = {
  id: number
  level: ManagedMcpLogEntry['level']
  time: string
  category: string
  message: string
}

type FormState = {
  id: string
  name: string
  toolPrefix: string
  transport: ManagedMcpDefinition['transport']
  command: string
  argsText: string
  cwd: string
  url: string
  headers: KeyValuePair[]
  env: KeyValuePair[]
  enabled: boolean
  autoStart: boolean
  startupTimeoutMs: number
}

const TOTAL_LOG_LIMIT = 1_000

const dashboard = useMcpDashboard()
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
  deleteDefinition,
  setStreamPaused
} = dashboard

const activeSection = ref<PortalSection>('logs')
const configMode = ref<ConfigMode>('create')
const themeMode = ref<ThemeMode>('light')

const navItems: Array<{ id: PortalSection; label: string; shortLabel: string }> = [
  { id: 'fleet', label: 'Fleet', shortLabel: 'FL' },
  { id: 'config', label: 'Config', shortLabel: 'CF' },
  { id: 'logs', label: 'Logs', shortLabel: 'LG' },
  { id: 'tools', label: 'Tools', shortLabel: 'TL' }
]

const levelOptions: Array<{ label: string; value: 'all' | ManagedMcpLogEntry['level'] }> = [
  { label: 'All Levels', value: 'all' },
  { label: 'Info', value: 'info' },
  { label: 'Debug', value: 'debug' },
  { label: 'Warn', value: 'warn' },
  { label: 'Error', value: 'error' }
]

const createErrors = ref<Record<string, string>>({})
const createNotice = ref('')

function blankForm(): FormState {
  return {
    id: '',
    name: '',
    toolPrefix: '',
    transport: 'stdio',
    command: '',
    argsText: '',
    cwd: '',
    url: '',
    headers: [],
    env: [],
    enabled: true,
    autoStart: true,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS
  }
}

const createForm = reactive<FormState>(blankForm())

function resetCreateForm(): void {
  Object.assign(createForm, blankForm())
  createNotice.value = ''
  createErrors.value = {}
}

function resetConfigForm(): void {
  createNotice.value = ''
  createErrors.value = {}

  if (configMode.value === 'edit' && selectedDefinition.value) {
    fillFormFromDefinition(selectedDefinition.value)
    return
  }

  resetCreateForm()
}

function fillFormFromDefinition(definition: ManagedMcpDefinition): void {
  Object.assign(createForm, {
    id: definition.id,
    name: definition.name,
    toolPrefix: definition.toolPrefix,
    transport: definition.transport,
    command: definition.transport === 'stdio' ? definition.command : '',
    argsText: definition.transport === 'stdio' ? definition.args.join('\n') : '',
    cwd: definition.transport === 'stdio' ? definition.cwd ?? '' : '',
    url: definition.transport === 'streamable-http' ? definition.url : '',
    headers: definition.transport === 'streamable-http' ? [...definition.headers] : [],
    env: definition.transport === 'stdio' ? [...definition.env] : [],
    enabled: definition.enabled,
    autoStart: definition.autoStart,
    startupTimeoutMs: definition.startupTimeoutMs
  })
  createErrors.value = {}
}

function clearCreateError(field: string): void {
  if (!createErrors.value[field] && !createErrors.value.form) {
    return
  }

  const nextErrors = { ...createErrors.value }
  delete nextErrors[field]
  delete nextErrors.form
  createErrors.value = nextErrors
}

function addHeader(): void {
  createForm.headers.push({ key: '', value: '' })
}

function removeHeader(index: number): void {
  createForm.headers.splice(index, 1)
}

function addEnv(): void {
  createForm.env.push({ key: '', value: '' })
}

function removeEnv(index: number): void {
  createForm.env.splice(index, 1)
}

function formatClock(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(timestamp))
}

function formatLongDate(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(timestamp))
}

function formatRelativeTime(timestamp: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 1_000))

  if (seconds < 60) {
    return `${seconds}s ago`
  }

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) {
    return `${minutes}m ago`
  }

  const hours = Math.round(minutes / 60)
  return `${hours}h ago`
}

function titleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function sourceLabel(source: ManagedMcpLogEntry['source']): string {
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

function parseLogMessage(entry: ManagedMcpLogEntry): { category: string; message: string } {
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

function statusRatio(snapshot: ManagedMcpSnapshot | null): number {
  if (!snapshot) {
    return 0
  }

  switch (snapshot.status) {
    case 'ready':
      return 1
    case 'starting':
      return 0.74
    case 'degraded':
      return 0.58
    case 'stopping':
      return 0.42
    case 'error':
      return 0.24
    case 'stopped':
      return 0.16
    default:
      return 0
  }
}

function stoplightRatio(value: number): number {
  return Math.max(0.08, Math.min(1, value))
}

async function handleServiceChange(event: Event): Promise<void> {
  const nextId = (event.target as HTMLSelectElement).value
  if (!nextId) {
    return
  }

  await select(nextId)

  if (activeSection.value === 'config') {
    setConfigMode('edit')
  }
}

function toggleStream(): void {
  setStreamPaused(!streamPaused.value)
}

async function confirmDelete(id: string): Promise<void> {
  const name = items.value.find((item) => item.definition.id === id)?.definition.name ?? id
  const confirmed = window.confirm(`Delete "${name}"? This action cannot be undone.`)

  if (!confirmed) {
    return
  }

  try {
    await deleteDefinition(id)
  } catch (error) {
    createErrors.value = {
      ...createErrors.value,
      form: error instanceof Error ? error.message : 'Could not delete the MCP.'
    }
  }
}

function exportConfig(): void {
  if (!import.meta.client || !selected.value) {
    return
  }

  const payload = JSON.stringify(selected.value.definition, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = url
  link.download = `${selected.value.definition.id}-config.json`
  link.click()

  URL.revokeObjectURL(url)
}

function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-_]+|[-_]+$/g, '')
}

function syncIdentifiers(field: 'id' | 'name', value: string): void {
  createNotice.value = ''
  clearCreateError(field)

  if (field === 'id') {
    createForm.id = normalizeIdentifier(value)
    if (!createForm.toolPrefix) {
      createForm.toolPrefix = createForm.id
    }
    return
  }

  createForm.name = value
}

function handleIdInput(event: Event): void {
  syncIdentifiers('id', (event.target as HTMLInputElement).value)
}

function handleNameInput(event: Event): void {
  syncIdentifiers('name', (event.target as HTMLInputElement).value)
}

function setTransport(transport: ManagedMcpDefinition['transport']): void {
  createNotice.value = ''
  createForm.transport = transport
  clearCreateError('transport')

  if (transport === 'stdio') {
    clearCreateError('url')
    return
  }

  clearCreateError('command')
}

function setConfigMode(mode: ConfigMode): void {
  createNotice.value = ''
  configMode.value = mode

  if (mode === 'edit') {
    if (selectedDefinition.value) {
      fillFormFromDefinition(selectedDefinition.value)
    }
    return
  }

  resetCreateForm()
}

function applyTheme(theme: ThemeMode): void {
  themeMode.value = theme

  if (!import.meta.client) {
    return
  }

  document.documentElement.dataset.theme = theme
  window.localStorage.setItem('mcp-portal-theme', theme)
}

function toggleTheme(): void {
  applyTheme(themeMode.value === 'light' ? 'dark' : 'light')
}

function buildDefinitionFromForm(): ManagedMcpDefinition | null {
  const candidate: ManagedMcpDefinition =
    createForm.transport === 'stdio'
      ? {
          id: configMode.value === 'edit' ? selectedDefinition.value?.id ?? createForm.id.trim() : createForm.id.trim(),
          name: createForm.name.trim(),
          enabled: createForm.enabled,
          autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: 'stdio',
          command: createForm.command.trim(),
          args: createForm.argsText
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          cwd: createForm.cwd.trim() || undefined,
          env: createForm.env.map((e) => ({ key: e.key.trim(), value: e.value }))
        }
      : {
          id: createForm.id.trim(),
          name: createForm.name.trim(),
          enabled: createForm.enabled,
          autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: 'streamable-http',
          url: createForm.url.trim(),
          headers: createForm.headers.map((h) => ({ key: h.key.trim(), value: h.value }))
        }

  const parsed = managedMcpDefinitionSchema.safeParse(candidate)
  if (parsed.success) {
    createErrors.value = {}
    return parsed.data
  }

  const nextErrors: Record<string, string> = {}

  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? 'form')
    if (!nextErrors[field]) {
      nextErrors[field] = issue.message
    }
  }

  createErrors.value = nextErrors
  return null
}

async function submitCreateForm(): Promise<void> {
  createNotice.value = ''

  const definition = buildDefinitionFromForm()
  if (!definition) {
    return
  }

  try {
    const snapshot =
      configMode.value === 'edit' && selectedDefinition.value
        ? await updateDefinition(selectedDefinition.value.id, definition)
        : await createDefinition(definition)

    if (configMode.value === 'create') {
      resetCreateForm()
    } else {
      fillFormFromDefinition(snapshot.definition)
    }

    createNotice.value =
      configMode.value === 'edit'
        ? `${snapshot.definition.name} updated successfully.`
        : `${snapshot.definition.name} added to the fleet.`
    activeSection.value = 'config'
  } catch (error) {
    createErrors.value = {
      ...createErrors.value,
      form: error instanceof Error ? error.message : 'Could not save the MCP.'
    }
  }
}

const selectedSnapshot = computed(() => selected.value)
const selectedDefinition = computed(() => selectedSnapshot.value?.definition ?? null)
const selectedPidLabel = computed(() => {
  if (!selectedSnapshot.value) {
    return 'No session'
  }

  if (selectedSnapshot.value.pid) {
    return `PID: ${selectedSnapshot.value.pid}`
  }

  return selectedDefinition.value?.transport === 'streamable-http' ? 'Remote target' : 'Awaiting process'
})

const logCounts = computed(() =>
  rawLogs.value.reduce(
    (counts, entry) => {
      counts[entry.level] += 1
      return counts
    },
    {
      debug: 0,
      info: 0,
      warn: 0,
      error: 0
    }
  )
)

const filteredLogRows = computed<ConsoleLogRow[]>(() =>
  logs.value.map((entry) => {
    const parsed = parseLogMessage(entry)

    return {
      id: entry.id,
      level: entry.level,
      time: formatClock(entry.timestamp),
      category: parsed.category,
      message: parsed.message
    }
  })
)

const bufferFreePercent = computed(() => Math.max(0, 100 - Math.round((rawLogs.value.length / TOTAL_LOG_LIMIT) * 100)))

const healthMetrics = computed<HealthMetric[]>(() => {
  const totalEntries = rawLogs.value.length || 1
  const flaggedEntries = logCounts.value.warn + logCounts.value.error

  return [
    {
      label: 'Status',
      value: selectedSnapshot.value ? titleCase(selectedSnapshot.value.status) : 'Offline',
      ratio: statusRatio(selectedSnapshot.value),
      tone: 'primary'
    },
    {
      label: 'Signal',
      value: `${flaggedEntries} flagged`,
      ratio: stoplightRatio(flaggedEntries / totalEntries),
      tone: 'secondary'
    },
    {
      label: 'Buffer',
      value: `${rawLogs.value.length}/${TOTAL_LOG_LIMIT}`,
      ratio: rawLogs.value.length / TOTAL_LOG_LIMIT,
      tone: 'tertiary'
    }
  ]
})

const metadataTags = computed<MetadataTag[]>(() => {
  if (!selectedDefinition.value) {
    return []
  }

  return [
    { label: 'service', value: selectedDefinition.value.name },
    { label: 'transport', value: selectedDefinition.value.transport },
    { label: 'prefix', value: selectedDefinition.value.toolPrefix },
    { label: 'startup', value: `${Math.round(selectedDefinition.value.startupTimeoutMs / 1_000)}s` },
    { label: 'auto', value: selectedDefinition.value.autoStart ? 'enabled' : 'manual' }
  ]
})

const eventStreamItems = computed<EventStreamItem[]>(() =>
  rawLogs.value
    .slice()
    .reverse()
    .filter((entry) => entry.level !== 'info' || entry.source === 'manager' || entry.message.startsWith('['))
    .slice(0, 4)
    .map((entry) => {
      const parsed = parseLogMessage(entry)

      return {
        id: `${entry.id}-${entry.timestamp}`,
        title: parsed.category,
        message: parsed.message,
        level: entry.level,
        relativeTime: formatRelativeTime(entry.timestamp)
      }
    })
)

const configPreview = computed(() => (selectedDefinition.value ? JSON.stringify(selectedDefinition.value, null, 2) : ''))
const selectedTools = computed(() => selectedSnapshot.value?.tools ?? [])

watch(
  () => selectedDefinition.value,
  (definition) => {
    if (configMode.value === 'edit' && definition) {
      fillFormFromDefinition(definition)
    }
  },
  { immediate: true }
)

onMounted(() => {
  if (!import.meta.client) {
    return
  }

  const savedTheme = window.localStorage.getItem('mcp-portal-theme')
  applyTheme(savedTheme === 'dark' ? 'dark' : 'light')
})
</script>

<template>
  <div class="portal-shell">
    <aside class="portal-sidebar">
      <div class="brand-card">
        <div class="brand-mark">
          <span>&gt;_</span>
        </div>

        <div>
          <h1>MCP Portal</h1>
          <p>V2.4 ACTIVE</p>
        </div>
      </div>

      <nav class="portal-nav" aria-label="Portal navigation">
        <button
          v-for="item in navItems"
          :key="item.id"
          class="portal-nav__item"
          :class="{ 'is-active': activeSection === item.id }"
          type="button"
          @click="activeSection = item.id"
        >
          <span class="portal-nav__icon">{{ item.shortLabel }}</span>
          <span>{{ item.label }}</span>
        </button>
      </nav>

      <div class="portal-sidebar__footer">
        <p class="portal-sidebar__caption">Local runtime control for managed MCP instances and shared tool gateways.</p>
      </div>
    </aside>

    <main class="portal-main">
      <header class="portal-topbar">
        <div class="portal-topbar__headline">
          <p>MCP COMMAND</p>

          <div class="service-switch" :class="{ 'is-empty': items.length === 0 }">
            <span class="service-switch__dot" />
            <select :value="selectedId ?? ''" :disabled="items.length === 0" @change="handleServiceChange">
              <option v-if="items.length === 0" value="">No active service</option>
              <option v-for="item in items" :key="item.definition.id" :value="item.definition.id">
                {{ item.definition.toolPrefix }}.service
              </option>
            </select>
          </div>
        </div>

        <div class="portal-topbar__controls">
          <label v-if="activeSection === 'logs'" class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.8 15.8 21 21M10.4 17.2a6.8 6.8 0 1 1 0-13.6 6.8 6.8 0 0 1 0 13.6Z" />
            </svg>
            <input v-model="searchQuery" placeholder="Search logs..." type="search" />
          </label>

          <button class="theme-toggle" type="button" @click="toggleTheme">
            {{ themeMode === 'dark' ? 'Light Mode' : 'Dark Mode' }}
          </button>

          <div class="profile-avatar" aria-hidden="true">{{ items.length }} MCP</div>
        </div>
      </header>

      <section v-if="activeSection === 'logs'" class="page-panel">
        <div class="page-hero">
          <div>
            <div class="page-hero__meta">
              <span class="live-badge">LIVE SESSION</span>
              <span class="page-hero__pid">{{ selectedPidLabel }}</span>
            </div>

            <h2>
              LIVE LOGS
              <span v-if="selectedDefinition">/ {{ selectedDefinition.toolPrefix }}</span>
            </h2>
          </div>

          <div class="page-hero__actions">
            <button class="action-button action-button--soft" type="button" :disabled="!selectedDefinition" @click="toggleStream">
              {{ streamPaused ? 'Resume Stream' : 'Pause Stream' }}
            </button>
            <button class="action-button" type="button" :disabled="!selectedDefinition" @click="exportConfig">Export Config</button>
          </div>
        </div>

        <div v-if="loading" class="empty-console">
          <h3>Loading portal data</h3>
          <p>Connecting to the runtime and preparing the latest MCP activity.</p>
        </div>

        <div v-else-if="!selectedSnapshot" class="empty-console">
          <h3>No managed MCPs</h3>
          <p>The runtime is up, but there are no configured services to inspect yet.</p>
        </div>

        <div v-else class="console-layout">
          <section class="console-card">
            <div class="console-card__header">
              <div class="console-card__title">
                <span class="window-dot window-dot--rose" />
                <span class="window-dot window-dot--amber" />
                <span class="window-dot window-dot--teal" />
                <strong>CONSOLE OUTPUT</strong>
              </div>

              <div class="console-card__filters">
                <label class="inline-select">
                  <select v-model="levelFilter">
                    <option v-for="option in levelOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </option>
                  </select>
                </label>
                <span class="console-card__window">Last {{ TOTAL_LOG_LIMIT }} lines</span>
              </div>
            </div>

            <div class="console-card__body">
              <div v-if="filteredLogRows.length === 0" class="console-empty">
                No logs match the current filters. Adjust the search or wait for the next stream event.
              </div>

              <article
                v-for="entry in filteredLogRows"
                :key="entry.id"
                class="console-row"
                :class="[`is-${entry.level}`]"
              >
                <time class="console-row__time">{{ entry.time }}</time>
                <span class="console-row__level">{{ entry.level }}</span>
                <div class="console-row__content">
                  <strong>{{ entry.category }}</strong>
                  <p>{{ entry.message }}</p>
                </div>
              </article>
            </div>

            <footer class="console-card__footer">
              <span><i class="status-dot" /> {{ streamPaused ? 'STREAM PAUSED' : 'CONNECTED' }}</span>
              <span>BUFFERS: {{ bufferFreePercent }}% FREE</span>
              <span>{{ filteredLogRows.length }} VISIBLE / {{ rawLogs.length }} TOTAL</span>
            </footer>
          </section>

          <aside class="console-sidebar">
            <section class="side-card">
              <h3>INSTANCE HEALTH</h3>

              <div v-for="metric in healthMetrics" :key="metric.label" class="meter">
                <div class="meter__copy">
                  <span>{{ metric.label }}</span>
                  <strong>{{ metric.value }}</strong>
                </div>

                <div class="meter__track">
                  <span class="meter__fill" :class="`is-${metric.tone}`" :style="{ width: `${Math.round(metric.ratio * 100)}%` }" />
                </div>
              </div>
            </section>

            <section class="side-card side-card--tags">
              <h3>METADATA TAGS</h3>

              <div class="tag-cloud">
                <span v-for="tag in metadataTags" :key="tag.label" class="meta-tag">{{ tag.label }}: {{ tag.value }}</span>
              </div>
            </section>

            <section class="side-card">
              <h3>EVENT STREAM</h3>

              <div v-if="eventStreamItems.length === 0" class="side-card__empty">
                Manager notices, warnings, and errors will appear here.
              </div>

              <article
                v-for="item in eventStreamItems"
                :key="item.id"
                class="event-item"
                :class="[`is-${item.level}`]"
              >
                <div class="event-item__dot" />
                <div>
                  <strong>{{ item.title }}</strong>
                  <p>{{ item.message }}</p>
                  <time>{{ item.relativeTime }}</time>
                </div>
              </article>
            </section>
          </aside>
        </div>
      </section>

      <section v-else-if="activeSection === 'fleet'" class="page-panel">
        <div class="section-title">
          <div>
            <p>FLEET</p>
            <h2>Managed Runtime Targets</h2>
          </div>
          <span>{{ items.length }} configured</span>
        </div>

        <div v-if="items.length === 0" class="empty-console">
          <h3>No fleet members</h3>
          <p>Once MCP definitions are stored, their runtime cards will appear here.</p>
        </div>

        <div v-else class="fleet-grid">
          <article
            v-for="snapshot in items"
            :key="snapshot.definition.id"
            class="fleet-card"
            :class="{ 'is-selected': selectedId === snapshot.definition.id }"
          >
            <button class="fleet-card__body" type="button" @click="select(snapshot.definition.id)">
              <div class="fleet-card__header">
                <div>
                  <p>{{ snapshot.definition.transport }}</p>
                  <h3>{{ snapshot.definition.name }}</h3>
                </div>
                <span class="fleet-card__status">{{ titleCase(snapshot.status) }}</span>
              </div>

              <dl class="fleet-card__stats">
                <div>
                  <dt>Prefix</dt>
                  <dd>{{ snapshot.definition.toolPrefix }}</dd>
                </div>
                <div>
                  <dt>Tools</dt>
                  <dd>{{ snapshot.toolCount }}</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>{{ formatRelativeTime(snapshot.updatedAt) }}</dd>
                </div>
              </dl>

              <p v-if="snapshot.lastError" class="fleet-card__error">{{ snapshot.lastError }}</p>
            </button>

            <div class="fleet-card__actions">
              <button class="action-chip" type="button" :disabled="actioning" @click="invokeAction(snapshot.definition.id, 'start')">Start</button>
              <button class="action-chip" type="button" :disabled="actioning" @click="invokeAction(snapshot.definition.id, 'stop')">Stop</button>
              <button class="action-chip" type="button" :disabled="actioning" @click="invokeAction(snapshot.definition.id, 'restart')">Restart</button>
              <button class="action-chip action-chip--danger" type="button" :disabled="saving" @click="confirmDelete(snapshot.definition.id)">Delete</button>
            </div>
          </article>
        </div>
      </section>

      <section v-else-if="activeSection === 'config'" class="page-panel">
        <div class="section-title">
          <div>
            <p>CONFIG</p>
            <h2>{{ configMode === 'edit' ? 'Edit Managed MCP' : 'Add Managed MCP' }}</h2>
          </div>
          <span>{{ configMode === 'edit' ? (selectedDefinition ? `Editing ${selectedDefinition.name}` : 'Select an MCP to edit') : 'Create a runtime target with validation.' }}</span>
        </div>

        <div class="config-layout">
          <section class="config-card config-card--form">
            <div class="config-card__modebar">
              <div>
                <h3>Connection Setup</h3>
                <p class="config-card__subcopy">
                  {{ configMode === 'edit' ? 'The form is prefilled from the selected MCP in the service switch.' : 'Create a new MCP definition and add it to the runtime fleet.' }}
                </p>
              </div>

              <div class="segmented-control segmented-control--mode" role="tablist" aria-label="Configuration mode">
                <button
                  class="segmented-control__option"
                  :class="{ 'is-active': configMode === 'create' }"
                  type="button"
                  @click="setConfigMode('create')"
                >
                  Create New
                </button>
                <button
                  class="segmented-control__option"
                  :class="{ 'is-active': configMode === 'edit' }"
                  :disabled="!selectedDefinition"
                  type="button"
                  @click="setConfigMode('edit')"
                >
                  Edit Selected
                </button>
              </div>
            </div>

            <div v-if="configMode === 'edit'" class="selection-banner" :class="{ 'is-empty': !selectedDefinition }">
              <template v-if="selectedDefinition">
                <strong>{{ selectedDefinition.name }}</strong>
                <span>{{ selectedDefinition.id }}</span>
                <span>{{ selectedDefinition.transport }}</span>
              </template>
              <template v-else>
                <strong>No MCP selected</strong>
                <span>Choose one from the service switch to edit its definition.</span>
              </template>
            </div>

            <form class="mcp-form" @submit.prevent="submitCreateForm">
              <div class="mcp-form__grid">
                <label class="field">
                  <span>MCP ID</span>
                  <input
                    :value="createForm.id"
                    autocomplete="off"
                    :disabled="configMode === 'edit'"
                    placeholder="playwright"
                    @input="handleIdInput"
                  />
                  <small>{{ configMode === 'edit' ? 'MCP IDs are fixed after creation.' : 'Letters, numbers, dashes, and underscores only.' }}</small>
                  <em v-if="createErrors.id">{{ createErrors.id }}</em>
                </label>

                <label class="field">
                  <span>Name</span>
                  <input
                    :value="createForm.name"
                    autocomplete="off"
                    placeholder="Playwright MCP"
                    @input="handleNameInput"
                  />
                  <small>Human-readable label for the fleet and logs views.</small>
                  <em v-if="createErrors.name">{{ createErrors.name }}</em>
                </label>

                <label class="field">
                  <span>Tool Prefix</span>
                  <input
                    v-model="createForm.toolPrefix"
                    autocomplete="off"
                    placeholder="playwright"
                    @input="clearCreateError('toolPrefix')"
                  />
                  <small>Used as the shared namespace for exposed tools.</small>
                  <em v-if="createErrors.toolPrefix">{{ createErrors.toolPrefix }}</em>
                </label>

                <label class="field">
                  <span>Startup Timeout</span>
                  <input v-model.number="createForm.startupTimeoutMs" min="1000" step="1000" type="number" @input="clearCreateError('startupTimeoutMs')" />
                  <small>Milliseconds to wait before startup is considered failed.</small>
                  <em v-if="createErrors.startupTimeoutMs">{{ createErrors.startupTimeoutMs }}</em>
                </label>
              </div>

              <div class="field">
                <span>Transport</span>
                <div class="segmented-control" role="radiogroup" aria-label="Transport selection">
                  <button
                    class="segmented-control__option"
                    :class="{ 'is-active': createForm.transport === 'stdio' }"
                    type="button"
                    @click="setTransport('stdio')"
                  >
                    stdio
                  </button>
                  <button
                    class="segmented-control__option"
                    :class="{ 'is-active': createForm.transport === 'streamable-http' }"
                    type="button"
                    @click="setTransport('streamable-http')"
                  >
                    streamable-http
                  </button>
                </div>
                <em v-if="createErrors.transport">{{ createErrors.transport }}</em>
              </div>

              <div v-if="createForm.transport === 'stdio'" class="mcp-form__stack">
                <label class="field">
                  <span>Command</span>
                  <input v-model="createForm.command" autocomplete="off" placeholder="npx" @input="clearCreateError('command')" />
                  <small>The executable used to launch the MCP process.</small>
                  <em v-if="createErrors.command">{{ createErrors.command }}</em>
                </label>

                <label class="field">
                  <span>Arguments</span>
                  <textarea v-model="createForm.argsText" placeholder="-y&#10;@modelcontextprotocol/server-playwright" rows="5" />
                  <small>One argument per line for clean parsing and review.</small>
                </label>

                <label class="field">
                  <span>Working Directory</span>
                  <input v-model="createForm.cwd" autocomplete="off" placeholder="C:\\tools\\mcp" />
                  <small>Optional. Leave empty to use the runtime working directory.</small>
                </label>

                <div class="field">
                  <span>Environment Variables</span>
                  <small>Optional environment variables passed to the MCP process.</small>

                  <div v-for="(variable, index) in createForm.env" :key="index" class="header-row">
                    <input
                      v-model="variable.key"
                      autocomplete="off"
                      placeholder="MY_VAR"
                      class="header-row__key"
                    />
                    <input
                      v-model="variable.value"
                      autocomplete="off"
                      placeholder="value"
                      class="header-row__value"
                    />
                    <button class="action-chip action-chip--danger" type="button" @click="removeEnv(index)">Remove</button>
                  </div>

                  <button class="action-button action-button--soft" type="button" @click="addEnv">Add Variable</button>
                </div>
              </div>

              <div v-else class="mcp-form__stack">
                <label class="field">
                  <span>Service URL</span>
                  <input v-model="createForm.url" autocomplete="off" placeholder="http://127.0.0.1:4100/mcp" @input="clearCreateError('url')" />
                  <small>Full streamable HTTP endpoint for the upstream MCP.</small>
                  <em v-if="createErrors.url">{{ createErrors.url }}</em>
                </label>

                <div class="field">
                  <span>HTTP Headers</span>
                  <small>Optional headers sent with every request to the upstream MCP.</small>

                  <div v-for="(header, index) in createForm.headers" :key="index" class="header-row">
                    <input
                      v-model="header.key"
                      autocomplete="off"
                      placeholder="Authorization"
                      class="header-row__key"
                    />
                    <input
                      v-model="header.value"
                      autocomplete="off"
                      placeholder="Bearer &lt;token&gt;"
                      class="header-row__value"
                    />
                    <button class="action-chip action-chip--danger" type="button" @click="removeHeader(index)">Remove</button>
                  </div>

                  <button class="action-button action-button--soft" type="button" @click="addHeader">Add Header</button>
                </div>
              </div>

              <div class="toggle-group">
                <label class="toggle-card">
                  <input v-model="createForm.enabled" type="checkbox" />
                  <span>Enabled</span>
                  <small>Registers the target with the runtime immediately.</small>
                </label>

                <label class="toggle-card">
                  <input v-model="createForm.autoStart" type="checkbox" />
                  <span>Auto-start</span>
                  <small>Starts the MCP automatically after creation.</small>
                </label>
              </div>

              <p v-if="createErrors.form" class="form-banner form-banner--error">{{ createErrors.form }}</p>
              <p v-else-if="createNotice" class="form-banner form-banner--success">{{ createNotice }}</p>

              <div class="mcp-form__actions">
                <button class="action-button" type="submit" :disabled="saving || (configMode === 'edit' && !selectedDefinition)">
                  {{
                    saving
                      ? configMode === 'edit'
                        ? 'Saving...'
                        : 'Creating...'
                      : configMode === 'edit'
                        ? 'Save Changes'
                        : 'Add MCP'
                  }}
                </button>
                <button class="action-button action-button--soft" type="button" :disabled="saving" @click="resetConfigForm">
                  {{ configMode === 'edit' ? 'Reset Changes' : 'Reset Form' }}
                </button>
              </div>
            </form>
          </section>

          <section class="config-card">
            <h3>Selected Runtime Definition</h3>

            <div v-if="!selectedDefinition" class="config-card__empty">
              Select an MCP from the service switch after creation to inspect its stored runtime definition.
            </div>

            <template v-else>
              <dl class="config-meta">
                <div>
                  <dt>Status</dt>
                  <dd>{{ titleCase(selectedSnapshot?.status ?? 'stopped') }}</dd>
                </div>
                <div>
                  <dt>PID</dt>
                  <dd>{{ selectedSnapshot?.pid ?? 'remote' }}</dd>
                </div>
                <div>
                  <dt>Last Update</dt>
                  <dd>{{ selectedSnapshot ? formatLongDate(selectedSnapshot.updatedAt) : 'N/A' }}</dd>
                </div>
                <div>
                  <dt>Visible Logs</dt>
                  <dd>{{ logs.length }}</dd>
                </div>
              </dl>

              <div class="config-card__actions">
                <button class="action-button" type="button" @click="exportConfig">Export Config</button>
              </div>

              <pre>{{ configPreview }}</pre>
            </template>
          </section>
        </div>
      </section>

      <section v-else class="page-panel">
        <div class="section-title">
          <div>
            <p>TOOLS</p>
            <h2>Registered Tool Catalog</h2>
          </div>
          <span>{{ selectedTools.length }} tools exposed</span>
        </div>

        <div v-if="selectedTools.length === 0" class="empty-console">
          <h3>No tools discovered</h3>
          <p>Start the selected MCP and its exposed tool catalog will be listed here.</p>
        </div>

        <div v-else class="tool-grid">
          <article v-for="tool in selectedTools" :key="tool.name" class="tool-card">
            <div class="tool-card__top">
              <p>{{ tool.upstreamName }}</p>
              <span class="tool-card__badge">{{ tool.title || 'Untitled tool' }}</span>
            </div>

            <h3>{{ tool.name }}</h3>
            <p class="tool-card__description">{{ tool.description || 'No description provided by the upstream MCP.' }}</p>

            <footer class="tool-card__footer">
              <span>{{ selectedDefinition?.transport || 'runtime' }}</span>
              <span>{{ selectedDefinition?.toolPrefix || 'shared' }}</span>
            </footer>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
