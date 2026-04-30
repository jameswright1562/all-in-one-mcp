<script setup lang="ts">
import type { ManagedMcpDefinition, ManagedMcpLogEntry, ManagedMcpSnapshot, KeyValuePair } from '@all-in-one-mcp/contracts'
import { managedMcpDefinitionSchema, DEFAULT_STARTUP_TIMEOUT_MS } from '@all-in-one-mcp/contracts'
import { useMcpDashboard } from './composables/useMcpDashboard'
import { formatClock, formatLongDate, formatRelativeTime, titleCase, normalizeIdentifier } from './utils/formatters'
import { sourceLabel, parseLogMessage } from './utils/log-helpers'
import { statusRatio, stoplightRatio } from './utils/status-helpers'
import Sidebar from './components/Sidebar.vue'
import TopBar from './components/TopBar.vue'
import LogsSection from './components/LogsSection.vue'
import FleetSection from './components/FleetSection.vue'
import ToolsSection from './components/ToolsSection.vue'
import ConfigForm from './components/ConfigForm.vue'

type PortalSection = 'logs' | 'fleet' | 'config' | 'tools'
type ConfigMode = 'create' | 'edit'
type ThemeMode = 'light' | 'dark'

const TOTAL_LOG_LIMIT = 1_000

const dashboard = useMcpDashboard()
const {
  items, logs, rawLogs, selected, selectedId,
  searchQuery, levelFilter, streamPaused,
  loading, actioning, saving,
  select, invokeAction, createDefinition,
  updateDefinition, deleteDefinition, setStreamPaused
} = dashboard

const activeSection = ref<PortalSection>('logs')
const configMode = ref<ConfigMode>('create')
const themeMode = ref<ThemeMode>('light')

const createErrors = ref<Record<string, string>>({})
const createNotice = ref('')

function blankForm(): FormState {
  return {
    id: '', name: '', toolPrefix: '', transport: 'stdio',
    command: '', argsText: '', cwd: '', url: '',
    headers: [], env: [], enabled: true, autoStart: true,
    startupTimeoutMs: DEFAULT_STARTUP_TIMEOUT_MS
  }
}

type FormState = {
  id: string; name: string; toolPrefix: string; transport: string;
  command: string; argsText: string; cwd: string; url: string;
  headers: KeyValuePair[]; env: KeyValuePair[];
  enabled: boolean; autoStart: boolean; startupTimeoutMs: number;
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
    id: definition.id, name: definition.name, toolPrefix: definition.toolPrefix,
    transport: definition.transport,
    command: definition.transport === 'stdio' ? definition.command : '',
    argsText: definition.transport === 'stdio' ? definition.args.join('\n') : '',
    cwd: definition.transport === 'stdio' ? definition.cwd ?? '' : '',
    url: definition.transport === 'streamable-http' ? definition.url : '',
    headers: definition.transport === 'streamable-http' ? [...definition.headers] : [],
    env: definition.transport === 'stdio' ? [...definition.env] : [],
    enabled: definition.enabled, autoStart: definition.autoStart,
    startupTimeoutMs: definition.startupTimeoutMs
  })
  createErrors.value = {}
}

function clearCreateError(field: string): void {
  if (!createErrors.value[field] && !createErrors.value.form) return
  const nextErrors = { ...createErrors.value }
  delete nextErrors[field]
  delete nextErrors.form
  createErrors.value = nextErrors
}

function addHeader(): void { createForm.headers.push({ key: '', value: '' }) }
function removeHeader(index: number): void { createForm.headers.splice(index, 1) }
function addEnv(): void { createForm.env.push({ key: '', value: '' }) }
function removeEnv(index: number): void { createForm.env.splice(index, 1) }

async function confirmDelete(id: string): Promise<void> {
  const name = items.value.find((item) => item.definition.id === id)?.definition.name ?? id
  if (!window.confirm(`Delete "${name}"? This action cannot be undone.`)) return
  try { await deleteDefinition(id) } catch (error) {
    createErrors.value = { ...createErrors.value, form: error instanceof Error ? error.message : 'Could not delete the MCP.' }
  }
}

async function toggleTool(upstreamName: string): Promise<void> {
  if (!selectedDefinition.value) return
  const definition = selectedDefinition.value
  const current = definition.disabledTools ?? []
  const nextDisabled = current.includes(upstreamName)
    ? current.filter((name) => name !== upstreamName)
    : [...current, upstreamName]
  try { await updateDefinition(definition.id, { ...definition, disabledTools: nextDisabled }) } catch (error) {
    createErrors.value = { ...createErrors.value, form: error instanceof Error ? error.message : 'Could not toggle the tool.' }
  }
}

function exportConfig(): void {
  if (!import.meta.client || !selected.value) return
  const payload = JSON.stringify(selected.value.definition, null, 2)
  const blob = new Blob([payload], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${selected.value.definition.id}-config.json`
  link.click()
  URL.revokeObjectURL(url)
}

function setTransport(transport: string): void {
  createNotice.value = ''
  createForm.transport = transport
  clearCreateError('transport')
  if (transport === 'stdio') { clearCreateError('url') } else { clearCreateError('command') }
}

function setConfigMode(mode: ConfigMode): void {
  createNotice.value = ''
  configMode.value = mode
  if (mode === 'edit') {
    if (selectedDefinition.value) fillFormFromDefinition(selectedDefinition.value)
    return
  }
  resetCreateForm()
}

function applyTheme(theme: ThemeMode): void {
  themeMode.value = theme
  if (!import.meta.client) return
  document.documentElement.dataset.theme = theme
  window.localStorage.setItem('mcp-portal-theme', theme)
}

function toggleTheme(): void { applyTheme(themeMode.value === 'light' ? 'dark' : 'light') }

function buildDefinitionFromForm(): ManagedMcpDefinition | null {
  const candidate: ManagedMcpDefinition =
    createForm.transport === 'stdio'
      ? {
          id: configMode.value === 'edit' ? selectedDefinition.value?.id ?? createForm.id.trim() : createForm.id.trim(),
          name: createForm.name.trim(), enabled: createForm.enabled, autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(), startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: 'stdio', command: createForm.command.trim(),
          args: createForm.argsText.split('\n').map((v) => v.trim()).filter(Boolean),
          cwd: createForm.cwd.trim() || undefined,
          env: createForm.env.map((e) => ({ key: e.key.trim(), value: e.value })),
          disabledTools: []
        }
      : {
          id: createForm.id.trim(), name: createForm.name.trim(), enabled: createForm.enabled,
          autoStart: createForm.autoStart, toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs), transport: 'streamable-http',
          url: createForm.url.trim(),
          headers: createForm.headers.map((h) => ({ key: h.key.trim(), value: h.value })),
          disabledTools: []
        }
  const parsed = managedMcpDefinitionSchema.safeParse(candidate)
  if (parsed.success) { createErrors.value = {}; return parsed.data }
  const nextErrors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? 'form')
    if (!nextErrors[field]) nextErrors[field] = issue.message
  }
  createErrors.value = nextErrors
  return null
}

async function submitCreateForm(): Promise<void> {
  createNotice.value = ''
  const definition = buildDefinitionFromForm()
  if (!definition) return
  try {
    const snapshot = configMode.value === 'edit' && selectedDefinition.value
      ? await updateDefinition(selectedDefinition.value.id, definition)
      : await createDefinition(definition)
    if (configMode.value === 'create') { resetCreateForm() } else { fillFormFromDefinition(snapshot.definition) }
    createNotice.value = configMode.value === 'edit' ? `${snapshot.definition.name} updated successfully.` : `${snapshot.definition.name} added to the fleet.`
    activeSection.value = 'config'
  } catch (error) {
    createErrors.value = { ...createErrors.value, form: error instanceof Error ? error.message : 'Could not save the MCP.' }
  }
}

const selectedSnapshot = computed(() => selected.value)
const selectedDefinition = computed(() => selectedSnapshot.value?.definition ?? null)
const selectedPidLabel = computed(() => {
  if (!selectedSnapshot.value) return 'No session'
  if (selectedSnapshot.value.pid) return `PID: ${selectedSnapshot.value.pid}`
  return selectedDefinition.value?.transport === 'streamable-http' ? 'Remote target' : 'Awaiting process'
})

const logCounts = computed(() =>
  rawLogs.value.reduce((counts, entry) => { counts[entry.level] += 1; return counts },
    { debug: 0, info: 0, warn: 0, error: 0 }))

const healthMetrics = computed(() => {
  const totalEntries = rawLogs.value.length || 1
  const flaggedEntries = logCounts.value.warn + logCounts.value.error
  return [
    { label: 'Status', value: selectedSnapshot.value ? titleCase(selectedSnapshot.value.status) : 'Offline', ratio: statusRatio(selectedSnapshot.value), tone: 'primary' as const },
    { label: 'Signal', value: `${flaggedEntries} flagged`, ratio: stoplightRatio(flaggedEntries / totalEntries), tone: 'secondary' as const },
    { label: 'Buffer', value: `${rawLogs.value.length}/${TOTAL_LOG_LIMIT}`, ratio: rawLogs.value.length / TOTAL_LOG_LIMIT, tone: 'tertiary' as const }
  ]
})

const metadataTags = computed(() => {
  if (!selectedDefinition.value) return []
  return [
    { label: 'service', value: selectedDefinition.value.name },
    { label: 'transport', value: selectedDefinition.value.transport },
    { label: 'prefix', value: selectedDefinition.value.toolPrefix },
    { label: 'startup', value: `${Math.round(selectedDefinition.value.startupTimeoutMs / 1_000)}s` },
    { label: 'auto', value: selectedDefinition.value.autoStart ? 'enabled' : 'manual' }
  ]
})

const eventStreamItems = computed(() =>
  rawLogs.value.slice().reverse()
    .filter((entry) => entry.level !== 'info' || entry.source === 'manager' || entry.message.startsWith('['))
    .slice(0, 4)
    .map((entry) => {
      const parsed = parseLogMessage(entry)
      return { id: `${entry.id}-${entry.timestamp}`, title: parsed.category, message: parsed.message, level: entry.level, relativeTime: formatRelativeTime(entry.timestamp) }
    })
)

const configPreview = computed(() => (selectedDefinition.value ? JSON.stringify(selectedDefinition.value, null, 2) : ''))
const allTools = computed(() => selectedSnapshot.value?.tools ?? [])
const selectedTools = computed(() => allTools.value.filter((t) => !t.disabled))

watch(
  () => selectedDefinition.value,
  (definition) => { if (configMode.value === 'edit' && definition) fillFormFromDefinition(definition) },
  { immediate: true }
)

onMounted(() => {
  if (!import.meta.client) return
  const savedTheme = window.localStorage.getItem('mcp-portal-theme')
  applyTheme(savedTheme === 'dark' ? 'dark' : 'light')
})
</script>

<template>
  <div class="portal-shell">
    <Sidebar :activeSection="activeSection" @update:activeSection="activeSection = $event" />

    <main class="portal-main">
      <TopBar
        :items="items"
        :selectedId="selectedId"
        :themeMode="themeMode"
        @update:selectedId="select"
        @toggleTheme="toggleTheme"
      >
        <template #search v-if="activeSection === 'logs'">
          <label class="search-field">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M15.8 15.8 21 21M10.4 17.2a6.8 6.8 0 1 1 0-13.6 6.8 6.8 0 0 1 0 13.6Z" />
            </svg>
            <input v-model="searchQuery" placeholder="Search logs..." type="search" />
          </label>
        </template>
      </TopBar>

      <LogsSection
        v-if="activeSection === 'logs'"
        :selectedSnapshot="selectedSnapshot"
        :selectedDefinition="selectedDefinition"
        :rawLogs="rawLogs"
        :logs="logs"
        :streamPaused="streamPaused"
        :loading="loading"
        :levelFilter="levelFilter"
        :searchQuery="searchQuery"
        @update:levelFilter="levelFilter = $event"
        @toggleStream="setStreamPaused(!streamPaused)"
        @exportConfig="exportConfig"
      />

      <FleetSection
        v-else-if="activeSection === 'fleet'"
        :items="items"
        :selectedId="selectedId"
        :actioning="actioning"
        :saving="saving"
        @select="select"
        @invokeAction="invokeAction"
        @delete="confirmDelete"
      />

      <section v-else-if="activeSection === 'config'" class="page-panel">
        <div class="section-title">
          <div>
            <p>CONFIG</p>
            <h2>{{ configMode === 'edit' ? 'Edit Managed MCP' : 'Add Managed MCP' }}</h2>
          </div>
          <span>{{ configMode === 'edit' ? (selectedDefinition ? `Editing ${selectedDefinition.name}` : 'Select an MCP to edit') : 'Create a runtime target with validation.' }}</span>
        </div>

        <div class="config-layout">
          <ConfigForm
            :mode="configMode"
            :selectedDefinition="selectedDefinition"
            :saving="saving"
            @submit="(def) => { configMode === 'edit' ? updateDefinition(selectedDefinition?.id ?? '', def) : createDefinition(def) }"
            @reset="resetConfigForm"
          />

          <section class="config-card">
            <h3>Selected Runtime Definition</h3>
            <div v-if="!selectedDefinition" class="config-card__empty">
              Select an MCP from the service switch after creation to inspect its stored runtime definition.
            </div>
            <template v-else>
              <dl class="config-meta">
                <div><dt>Status</dt><dd>{{ titleCase(selectedSnapshot?.status ?? 'stopped') }}</dd></div>
                <div><dt>PID</dt><dd>{{ selectedSnapshot?.pid ?? 'remote' }}</dd></div>
                <div><dt>Last Update</dt><dd>{{ selectedSnapshot ? formatLongDate(selectedSnapshot.updatedAt) : 'N/A' }}</dd></div>
                <div><dt>Visible Logs</dt><dd>{{ logs.length }}</dd></div>
              </dl>
              <div class="config-card__actions">
                <button class="action-button" type="button" @click="exportConfig">Export Config</button>
              </div>
              <pre>{{ configPreview }}</pre>
            </template>
          </section>
        </div>
      </section>

      <ToolsSection
        v-else
        :tools="allTools"
        :selectedDefinition="selectedDefinition"
        @toggleTool="toggleTool"
      />
    </main>
  </div>
</template>

<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Manrope:wght@500;600;700;800&display=swap');
</style>

<style src="./assets/css/base.css" />
<style src="./assets/css/sidebar.css" />
<style src="./assets/css/topBar.css" />
<style src="./assets/css/logs.css" />
<style src="./assets/css/fleet.css" />
<style src="./assets/css/config.css" />
<style src="./assets/css/tools.css" />
<style src="./assets/css/responsive.css" />
