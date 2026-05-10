<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import type { ManagedMcpDefinition, KeyValuePair } from '@all-in-one-mcp/contracts'
import { managedMcpDefinitionSchema, DEFAULT_STARTUP_TIMEOUT_MS } from '@all-in-one-mcp/contracts'
import { normalizeIdentifier } from '../utils/formatters'

type FormState = {
  id: string
  name: string
  toolPrefix: string
  transport: string
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

type ConfigMode = 'create' | 'edit'

const props = defineProps<{
  mode: ConfigMode
  selectedDefinition: ManagedMcpDefinition | null
  saving: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', definition: ManagedMcpDefinition): void
  (e: 'reset'): void
}>()

const createErrors = reactive<Record<string, string>>({})
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

function resetForm(): void {
  Object.assign(createForm, blankForm())
  createNotice.value = ''
  createErrors.value = {}
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

function clearError(field: string): void {
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

function handleIdInput(event: Event): void {
  const value = (event.target as HTMLInputElement).value
  clearError('id')
  createForm.id = normalizeIdentifier(value)
  if (!createForm.toolPrefix) {
    createForm.toolPrefix = createForm.id
  }
}

function handleNameInput(event: Event): void {
  clearError('name')
  createForm.name = (event.target as HTMLInputElement).value
}

function setTransport(transport: string): void {
  createForm.transport = transport
  clearError('transport')

  if (transport === 'stdio') {
    clearError('url')
    return
  }

  clearError('command')
}

function buildDefinition(): ManagedMcpDefinition | null {
  const candidate =
    createForm.transport === 'stdio'
      ? {
          id: props.mode === 'edit' && props.selectedDefinition ? props.selectedDefinition.id : createForm.id.trim(),
          name: createForm.name.trim(),
          enabled: createForm.enabled,
          autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: 'stdio' as const,
          command: createForm.command.trim(),
          args: createForm.argsText
            .split('\n')
            .map((value) => value.trim())
            .filter(Boolean),
          cwd: createForm.cwd.trim() || undefined,
          env: createForm.env.map((e) => ({ key: e.key.trim(), value: e.value })),
          disabledTools: []
        }
      : {
          id: createForm.id.trim(),
          name: createForm.name.trim(),
          enabled: createForm.enabled,
          autoStart: createForm.autoStart,
          toolPrefix: createForm.toolPrefix.trim(),
          startupTimeoutMs: Number(createForm.startupTimeoutMs),
          transport: 'streamable-http' as const,
          url: createForm.url.trim(),
          headers: createForm.headers.map((h) => ({ key: h.key.trim(), value: h.value })),
          disabledTools: []
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

function submit(): void {
  createNotice.value = ''

  const definition = buildDefinition()
  if (!definition) {
    return
  }

  emit('submit', definition)
}

watch(
  () => props.selectedDefinition,
  (definition) => {
    if (props.mode === 'edit' && definition) {
      fillFormFromDefinition(definition)
    }
  },
  { immediate: true }
)

defineExpose({ resetForm, fillFormFromDefinition })
</script>

<template>
  <section class="config-card config-card--form">
    <div class="config-card__modebar">
      <div>
        <h3>Connection Setup</h3>
        <p class="config-card__subcopy">
          {{ mode === 'edit' ? 'The form is prefilled from the selected MCP in the service switch.' : 'Create a new MCP definition and add it to the runtime fleet.' }}
        </p>
      </div>
    </div>

    <form class="mcp-form" @submit.prevent="submit">
      <div class="mcp-form__grid">
        <label class="field">
          <span>MCP ID</span>
          <input
            :value="createForm.id"
            autocomplete="off"
            :disabled="mode === 'edit'"
            placeholder="playwright"
            @input="handleIdInput"
          />
          <small>{{ mode === 'edit' ? 'MCP IDs are fixed after creation.' : 'Letters, numbers, dashes, and underscores only.' }}</small>
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
            @input="clearError('toolPrefix')"
          />
          <small>Used as the shared namespace for exposed tools.</small>
          <em v-if="createErrors.toolPrefix">{{ createErrors.toolPrefix }}</em>
        </label>

        <label class="field">
          <span>Startup Timeout</span>
          <input v-model.number="createForm.startupTimeoutMs" min="1000" step="1000" type="number" @input="clearError('startupTimeoutMs')" />
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
          <input v-model="createForm.command" autocomplete="off" placeholder="npx" @input="clearError('command')" />
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
          <input v-model="createForm.url" autocomplete="off" placeholder="http://127.0.0.1:4100/mcp" @input="clearError('url')" />
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
        <button class="action-button" type="submit" :disabled="saving || (mode === 'edit' && !selectedDefinition)">
          {{ saving ? (mode === 'edit' ? 'Saving...' : 'Creating...') : (mode === 'edit' ? 'Save Changes' : 'Add MCP') }}
        </button>
        <button class="action-button action-button--soft" type="button" :disabled="saving" @click="emit('reset')">
          {{ mode === 'edit' ? 'Reset Changes' : 'Reset Form' }}
        </button>
      </div>
    </form>
  </section>
</template>
