import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { expect, test, type Locator, type Page, type APIRequestContext, type APIResponse } from '@playwright/test'

type CodexConfigMcp = {
  id: string
  enabled: boolean
  transport: 'stdio' | 'streamable-http'
  command?: string
  url?: string
}

type CreatedMcp = {
  id: string
  name: string
  toolPrefix: string
  transport: 'stdio' | 'streamable-http'
  command?: string
  url?: string
}

const currentDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(currentDir, '../../../..')
const stdioFixturePath = resolve(repoRoot, 'packages/runtime/test/fixtures/stdio-tool-server.mjs')
const streamableFixturePath = resolve(repoRoot, 'packages/runtime/test/fixtures/streamable-http-server.mjs')
const codexConfigPath = process.env.CODEX_CONFIG_PATH ?? join(homedir(), '.codex', 'config.toml')
const artifactDirectory = resolve(currentDir, '../test-results')
const dashboardBaseUrl = 'http://127.0.0.1:4511'
const runtimeBaseUrl = 'http://127.0.0.1:4100'

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function titleCase(value: string): string {
  return value
    .split(/[-_.]/g)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function parseQuotedValue(value: string): string | undefined {
  const doubleQuoted = value.match(/^"((?:\\.|[^"])*)"$/)
  if (doubleQuoted) {
    return JSON.parse(value) as string
  }

  const singleQuoted = value.match(/^'((?:\\.|[^'])*)'$/)
  if (singleQuoted) {
    return singleQuoted[1] ?? ''
  }

  return undefined
}

function parseBooleanValue(value: string): boolean | undefined {
  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  return undefined
}

function parseCodexConfigMcps(configPath = codexConfigPath): CodexConfigMcp[] {
  if (!existsSync(configPath)) {
    return []
  }

  const content = readFileSync(configPath, 'utf8')
  const lines = content.split(/\r?\n/g)
  const items: CodexConfigMcp[] = []
  let current: CodexConfigMcp | null = null

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const sectionMatch = line.match(/^\[mcp_servers\.([^\]]+)\]$/)
    if (sectionMatch) {
      if (current && (current.command || current.url)) {
        items.push(current)
      }

      current = {
        id: sectionMatch[1] ?? '',
        enabled: true,
        transport: 'stdio'
      }
      continue
    }

    if (!current || line.startsWith('[')) {
      if (current && line.startsWith('[') && (current.command || current.url)) {
        items.push(current)
      }
      current = null
      continue
    }

    const equalsIndex = line.indexOf('=')
    if (equalsIndex < 0) {
      continue
    }

    const key = line.slice(0, equalsIndex).trim()
    const rawValue = line.slice(equalsIndex + 1).trim()

    if (key === 'enabled') {
      current.enabled = parseBooleanValue(rawValue) ?? current.enabled
      continue
    }

    if (key === 'command') {
      current.command = parseQuotedValue(rawValue)
      continue
    }

    if (key === 'url') {
      current.url = parseQuotedValue(rawValue)
      current.transport = 'streamable-http'
    }
  }

  if (current && (current.command || current.url)) {
    items.push(current)
  }

  return items
}

async function createManagedMcp(
  request: APIRequestContext,
  definition: Record<string, unknown>
): Promise<void> {
  const response = await request.post(`${runtimeBaseUrl}/api/mcps`, {
    data: definition
  })

  expect(response.ok()).toBeTruthy()
}

async function parseJson<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T
}

function buildStdioDefinition(options: {
  id: string
  name: string
  enabled?: boolean
  autoStart?: boolean
  toolPrefix?: string
  startupTimeoutMs?: number
  command?: string
  args?: string[]
}): Record<string, unknown> {
  return {
    id: options.id,
    name: options.name,
    enabled: options.enabled ?? true,
    autoStart: options.autoStart ?? true,
    toolPrefix: options.toolPrefix ?? options.id,
    startupTimeoutMs: options.startupTimeoutMs ?? 10_000,
    transport: 'stdio',
    command: options.command ?? process.execPath,
    args: options.args ?? [stdioFixturePath],
    env: []
  }
}

function buildStreamableDefinition(options: {
  id: string
  name: string
  url: string
  enabled?: boolean
  autoStart?: boolean
  toolPrefix?: string
  startupTimeoutMs?: number
}): Record<string, unknown> {
  return {
    id: options.id,
    name: options.name,
    enabled: options.enabled ?? true,
    autoStart: options.autoStart ?? true,
    toolPrefix: options.toolPrefix ?? options.id,
    startupTimeoutMs: options.startupTimeoutMs ?? 10_000,
    transport: 'streamable-http',
    url: options.url,
    headers: []
  }
}

async function getManagedMcpStatus(request: APIRequestContext, id: string): Promise<string> {
  const response = await request.get(`${runtimeBaseUrl}/api/mcps/${id}`)

  if (!response.ok()) {
    return 'missing'
  }

  const payload = (await response.json()) as { status: string }
  return payload.status
}

async function waitForManagedMcpStatus(
  request: APIRequestContext,
  id: string,
  expected: string | RegExp
): Promise<void> {
  await expect
    .poll(async () => getManagedMcpStatus(request, id), {
      timeout: 20_000
    })
    .toMatch(expected)
}

async function openSection(page: Page, section: 'Fleet' | 'Config' | 'Logs' | 'Tools'): Promise<void> {
  await page.locator('.portal-nav__item').filter({ hasText: section }).click()
}

async function selectService(page: Page, id: string): Promise<void> {
  await page.locator('.service-switch select').selectOption(id)
}

function field(page: Page, label: string): Locator {
  return page
    .locator('label.field')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input, textarea')
    .first()
}

function fieldError(page: Page, label: string): Locator {
  return page.locator('label.field').filter({ has: page.getByText(label, { exact: true }) }).locator('em').first()
}

function configItemsFromCodex(): CreatedMcp[] {
  return parseCodexConfigMcps().map((item) => ({
    id: item.id,
    name: titleCase(item.id),
    toolPrefix: item.id,
    transport: item.transport,
    command: item.command,
    url: item.url
  }))
}

function streamableFixtureReadyFile(id: string): string {
  mkdirSync(artifactDirectory, { recursive: true })
  return join(artifactDirectory, `${id}-remote-ready.txt`)
}

async function startRemoteFixture(id: string, port: number): Promise<{ child: ChildProcess; url: string }> {
  const readyFile = streamableFixtureReadyFile(id)
  rmSync(readyFile, { force: true })

  const child = spawn(process.execPath, [streamableFixturePath, String(port), readyFile], {
    cwd: repoRoot,
    stdio: 'ignore'
  })

  await expect
    .poll(() => (existsSync(readyFile) ? readFileSync(readyFile, 'utf8').trim() : ''), {
      timeout: 15_000
    })
    .toBe(String(port))

  return {
    child,
    url: `http://127.0.0.1:${port}/mcp`
  }
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.killed) {
    return
  }

  child.kill('SIGTERM')
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGKILL')
      }
      resolve()
    }, 5_000)
  })
}

test.describe('dashboard ui', () => {
  test('shows the empty-state experience before MCPs are added', async ({ page, request }) => {
    const healthResponse = await request.get(`${runtimeBaseUrl}/healthz`)
    expect(healthResponse.ok()).toBeTruthy()
    expect(await parseJson<{ status: string }>(healthResponse)).toEqual({ status: 'ok' })

    await page.goto('/')

    await expect(page.locator('.service-switch select')).toBeDisabled()
    await expect(page.locator('.service-switch select')).toHaveValue('')
    await expect(page.locator('.service-switch select option')).toHaveCount(1)
    await expect(page.getByText('0 MCP')).toBeVisible()
    await expect(page.getByText('No managed MCPs')).toBeVisible()

    await page.getByRole('button', { name: 'Dark Mode' }).click()
    await expect(page.getByRole('button', { name: 'Light Mode' })).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .toBe('dark')
    await page.reload()
    await expect(page.getByRole('button', { name: 'Light Mode' })).toBeVisible()
    await page.getByRole('button', { name: 'Light Mode' }).click()
    await expect(page.getByRole('button', { name: 'Dark Mode' })).toBeVisible()

    await openSection(page, 'Fleet')
    await expect(page.getByText('No fleet members')).toBeVisible()

    await openSection(page, 'Config')
    await expect(page.getByRole('button', { name: 'Edit Selected' })).toBeDisabled()
    await expect(page.getByText('Select an MCP from the service switch after creation to inspect its stored runtime definition.')).toBeVisible()

    await openSection(page, 'Tools')
    await expect(page.getByText('No tools discovered')).toBeVisible()
  })

  test('renders each MCP from the local Codex config in fleet and config views', async ({ page, request }) => {
    const items = configItemsFromCodex()
    test.skip(items.length === 0, `No Codex MCP entries found at ${codexConfigPath}.`)

    for (const item of items) {
      if (item.transport === 'stdio') {
        await createManagedMcp(request, {
          id: item.id,
          name: item.name,
          enabled: false,
          autoStart: false,
          toolPrefix: item.toolPrefix,
          startupTimeoutMs: 5_000,
          transport: 'stdio',
          command: item.command ?? 'npx',
          args: [],
          env: []
        })
        continue
      }

      await createManagedMcp(request, {
        id: item.id,
        name: item.name,
        enabled: false,
        autoStart: false,
        toolPrefix: item.toolPrefix,
        startupTimeoutMs: 5_000,
        transport: 'streamable-http',
        url: item.url ?? 'http://127.0.0.1:59999/mcp',
        headers: []
      })
    }

    await page.goto('/')
    await openSection(page, 'Fleet')

    await expect(page.getByText(`${items.length} configured`)).toBeVisible()
    await expect(page.locator('.fleet-card')).toHaveCount(items.length)
    await expect(page.locator('.service-switch select option')).toHaveCount(items.length)

    for (const item of items) {
      await test.step(`checks ${item.id}`, async () => {
        await selectService(page, item.id)
        await openSection(page, 'Config')
        await page.getByRole('button', { name: 'Edit Selected' }).click()

        await expect(page.locator('.selection-banner')).toContainText(item.name)
        await expect(field(page, 'MCP ID')).toHaveValue(item.id)
        await expect(field(page, 'Name')).toHaveValue(item.name)
        await expect(field(page, 'Tool Prefix')).toHaveValue(item.toolPrefix)

        if (item.transport === 'stdio') {
          await expect(field(page, 'Command')).toHaveValue(item.command ?? 'npx')
          await expect(page.getByText('The executable used to launch the MCP process.')).toBeVisible()
        } else {
          await expect(field(page, 'Service URL')).toHaveValue(item.url ?? '')
          await expect(page.getByText('Full streamable HTTP endpoint for the upstream MCP.')).toBeVisible()
        }
      })
    }
  })

  test('reflects backend add, update, start, and delete events in the frontend', async ({ page, request }) => {
    const id = uniqueId('proxy-ui')
    const initialName = 'Proxy UI'
    const updatedName = 'Proxy UI Updated'

    await page.goto('/')
    await openSection(page, 'Fleet')
    const initialCount = await page.locator('.fleet-card').count()

    const createResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
      data: buildStdioDefinition({
        id,
        name: initialName,
        enabled: false,
        autoStart: false
      })
    })

    expect(createResponse.ok()).toBeTruthy()
    await expect(page.locator('.fleet-card')).toHaveCount(initialCount + 1)
    await selectService(page, id)
    await expect(page.locator('.service-switch select')).toHaveValue(id)

    await openSection(page, 'Tools')
    await expect(page.getByText('No tools discovered')).toBeVisible()

    const startResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${id}/start`)
    expect(startResponse.ok()).toBeTruthy()
    await expect(page.getByText(`${id}.echo`)).toBeVisible()

    const updateResponse = await request.patch(`${dashboardBaseUrl}/api/mcps/${id}`, {
      data: buildStdioDefinition({
        id,
        name: updatedName,
        enabled: false,
        autoStart: false
      })
    })

    expect(updateResponse.ok()).toBeTruthy()
    await openSection(page, 'Config')
    await page.getByRole('button', { name: 'Edit Selected' }).click()
    await expect(field(page, 'Name')).toHaveValue(updatedName)

    const deleteResponse = await request.delete(`${dashboardBaseUrl}/api/mcps/${id}`)
    expect(deleteResponse.status()).toBe(204)
    await expect(page.locator('.fleet-card').filter({ hasText: updatedName })).toHaveCount(0)
  })

  test('creates, filters, and controls a live stdio MCP through the dashboard', async ({ page, request }) => {
    const id = uniqueId('fixture-stdio')

    await page.goto('/')
    await openSection(page, 'Config')

    await field(page, 'MCP ID').fill(id)
    await field(page, 'Name').fill('Fixture UI')
    await field(page, 'Tool Prefix').fill(id)
    await field(page, 'Command').fill(process.execPath)
    await field(page, 'Arguments').fill(stdioFixturePath)
    await page.getByRole('button', { name: 'Add MCP' }).click()

    await waitForManagedMcpStatus(request, id, /ready/)
    await selectService(page, id)
    await expect(page.locator('.service-switch select')).toHaveValue(id)

    await openSection(page, 'Logs')
    await expect(page.getByText('LIVE LOGS')).toBeVisible()
    await expect(page.getByText('Managed MCP is ready.').first()).toBeVisible()

    await page.getByPlaceholder('Search logs...').fill('runtime.tools')
    await expect(page.locator('.console-row')).toHaveCount(1)
    await expect(page.getByText('Tool catalog refreshed (1 tools).').first()).toBeVisible()

    await page.getByPlaceholder('Search logs...').fill('does-not-exist')
    await expect(page.getByText('No logs match the current filters. Adjust the search or wait for the next stream event.')).toBeVisible()
    await page.getByPlaceholder('Search logs...').fill('')

    await page.locator('.inline-select select').selectOption('debug')
    await expect(page.getByText('Tool catalog refreshed (1 tools).').first()).toBeVisible()
    await page.locator('.inline-select select').selectOption('all')

    await page.getByRole('button', { name: 'Pause Stream' }).click()
    await expect(page.getByText('STREAM PAUSED')).toBeVisible()
    await page.getByRole('button', { name: 'Resume Stream' }).click()
    await expect(page.getByText('CONNECTED')).toBeVisible()

    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export Config' }).first().click()
    expect((await download).suggestedFilename()).toBe(`${id}-config.json`)

    await openSection(page, 'Tools')
    await expect(page.getByText(`${id}.echo`)).toBeVisible()
    await expect(page.getByText('Echo a string for runtime integration tests.')).toBeVisible()

    await openSection(page, 'Fleet')
    const fleetCard = page.locator('.fleet-card').filter({ hasText: 'Fixture UI' })
    await fleetCard.getByRole('button', { name: 'Stop', exact: true }).click()
    await waitForManagedMcpStatus(request, id, /stopped/)
    await expect(fleetCard.getByText('Stopped')).toBeVisible()

    await fleetCard.getByRole('button', { name: 'Start', exact: true }).click()
    await waitForManagedMcpStatus(request, id, /ready/)
    await expect(fleetCard.getByText('Ready')).toBeVisible()
  })

  test('auto-scrolls the logs console to the bottom when new entries arrive', async ({ page, request }) => {
    const id = uniqueId('auto-scroll')

    await page.goto('/')
    await openSection(page, 'Config')
    await field(page, 'MCP ID').fill(id)
    await field(page, 'Name').fill('Auto Scroll Test')
    await field(page, 'Tool Prefix').fill(id)
    await field(page, 'Command').fill(process.execPath)
    await field(page, 'Arguments').fill(stdioFixturePath)
    await page.getByRole('button', { name: 'Add MCP' }).click()
    await waitForManagedMcpStatus(request, id, /ready/)
    await selectService(page, id)

    await openSection(page, 'Logs')
    const consoleBody = page.locator('.console-card__body')
    await expect(consoleBody).toBeVisible()
    await expect(page.getByText('Managed MCP is ready.').first()).toBeVisible()

    // Scroll up to the top, then verify new logs auto-scroll back to bottom
    await consoleBody.evaluate((el) => { el.scrollTop = 0 })
    await expect.poll(() => consoleBody.evaluate((el) => el.scrollTop)).toBe(0)

    // Trigger a restart to generate new log entries
    await request.post(`${dashboardBaseUrl}/api/mcps/${id}/restart`)
    await waitForManagedMcpStatus(request, id, /ready/)

    // After the restart, the new "Stopping" / "Starting" / "ready" log lines
    // should cause the console to scroll to the bottom automatically
    await expect
      .poll(async () => {
        const scrollTop = await consoleBody.evaluate((el) => el.scrollTop)
        const scrollHeight = await consoleBody.evaluate((el) => el.scrollHeight)
        const clientHeight = await consoleBody.evaluate((el) => el.clientHeight)
        return scrollHeight - scrollTop - clientHeight
      }, { timeout: 10_000 })
      .toBeLessThanOrEqual(2)
  })

  test('creates and edits a live streamable-http MCP through the dashboard', async ({ page, request }) => {
    const id = uniqueId('fixture-remote')
    const remotePort = 47_000 + Math.floor(Math.random() * 1_000)
    const fixture = await startRemoteFixture(id, remotePort)

    try {
      await page.goto('/')
      await openSection(page, 'Config')

      await field(page, 'MCP ID').fill(id)
      await field(page, 'Name').fill('Remote Fixture')
      await field(page, 'Tool Prefix').fill(id)
      await page.getByRole('button', { name: 'streamable-http' }).click()
      await field(page, 'Service URL').fill(fixture.url)
      await page.getByRole('button', { name: 'Add MCP' }).click()

      await waitForManagedMcpStatus(request, id, /ready/)
      await selectService(page, id)
      await expect(page.locator('.service-switch select')).toHaveValue(id)

      await openSection(page, 'Logs')
      await expect(page.getByText('Remote target')).toBeVisible()
      await expect(page.getByText('Managed MCP is ready.').first()).toBeVisible()

      await openSection(page, 'Tools')
      await expect(page.getByText(`${id}.echo`)).toBeVisible()
      await expect(page.getByText('Echo a string for remote transport tests.')).toBeVisible()

      await openSection(page, 'Config')
      await page.getByRole('button', { name: 'Edit Selected' }).click()
      await field(page, 'Name').fill('Remote Fixture Updated')
      await page.getByRole('button', { name: 'Save Changes' }).click()
      await expect(field(page, 'Name')).toHaveValue('Remote Fixture Updated')

      await field(page, 'Name').fill('Temporary Rename')
      await page.getByRole('button', { name: 'Reset Changes' }).click()
      await expect(field(page, 'Name')).toHaveValue('Remote Fixture Updated')
    } finally {
      await stopChild(fixture.child)
    }
  })

  test('shows validation and duplicate-prefix errors in the config form', async ({ page, request }) => {
    const existingId = uniqueId('duplicate-prefix')

    await createManagedMcp(request, {
      id: existingId,
      name: 'Existing MCP',
      enabled: false,
      autoStart: false,
      toolPrefix: existingId,
      startupTimeoutMs: 5_000,
      transport: 'stdio',
      command: process.execPath,
      args: [stdioFixturePath],
      env: []
    })

    await page.goto('/')
    await openSection(page, 'Config')

    await page.getByRole('button', { name: 'streamable-http' }).click()
    await field(page, 'MCP ID').fill(uniqueId('invalid-url'))
    await field(page, 'Name').fill('Invalid URL MCP')
    await field(page, 'Tool Prefix').fill(uniqueId('invalid-url-prefix'))
    await field(page, 'Service URL').fill('not-a-url')
    await page.getByRole('button', { name: 'Add MCP' }).click()
    await expect(fieldError(page, 'Service URL')).toBeVisible()

    await page.getByRole('button', { name: 'Reset Form' }).click()

    await field(page, 'MCP ID').fill(uniqueId('new-duplicate'))
    await field(page, 'Name').fill('Duplicate Prefix')
    await field(page, 'Tool Prefix').fill(existingId)
    await field(page, 'Command').fill(process.execPath)
    await field(page, 'Arguments').fill(stdioFixturePath)
    await page.getByRole('button', { name: 'Add MCP' }).click()

    await expect(page.getByText(`Tool prefix "${existingId}" is already in use.`)).toBeVisible()
  })

  test('exercises the backend API through the dashboard proxy', async ({ request }) => {
    const missingId = uniqueId('missing')
    const stdioId = uniqueId('api-stdio')
    const duplicateId = uniqueId('api-duplicate')
    const remoteId = uniqueId('api-remote')
    const remotePort = 48_000 + Math.floor(Math.random() * 500)
    const remoteFixture = await startRemoteFixture(remoteId, remotePort)

    try {
      const healthResponse = await request.get(`${runtimeBaseUrl}/healthz`)
      expect(healthResponse.ok()).toBeTruthy()
      expect(await parseJson<{ status: string }>(healthResponse)).toEqual({ status: 'ok' })

      const missingResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${missingId}`)
      expect(missingResponse.status()).toBe(404)

      const createStdioResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
        data: buildStdioDefinition({
          id: stdioId,
          name: 'API Stdio',
          enabled: true,
          autoStart: false
        })
      })
      expect(createStdioResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(createStdioResponse)).status).toBe('stopped')

      const duplicateResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
        data: buildStdioDefinition({
          id: duplicateId,
          name: 'Duplicate Prefix',
          enabled: true,
          autoStart: false,
          toolPrefix: stdioId
        })
      })
      expect(duplicateResponse.status()).toBe(409)
      expect(
        await parseJson<{ statusMessage?: string; message?: string }>(duplicateResponse)
      ).toMatchObject({
        statusMessage: `Tool prefix "${stdioId}" is already in use.`,
        message: `Tool prefix "${stdioId}" is already in use.`
      })

      const listResponse = await request.get(`${dashboardBaseUrl}/api/mcps`)
      expect(listResponse.ok()).toBeTruthy()
      const listPayload = await parseJson<{ items: Array<{ definition: { id: string } }>; generatedAt: string }>(listResponse)
      expect(listPayload.items.some((item) => item.definition.id === stdioId)).toBe(true)

      const startResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${stdioId}/start`)
      expect(startResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(startResponse)).status).toBe('ready')

      const logsResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${stdioId}/logs?limit=2`)
      expect(logsResponse.ok()).toBeTruthy()
      const logsPayload = await parseJson<{ items: Array<{ message: string }> }>(logsResponse)
      expect(logsPayload.items.length).toBeLessThanOrEqual(2)
      expect(logsPayload.items.some((entry) => entry.message.includes('Managed MCP is ready.'))).toBe(true)

      const restartResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${stdioId}/restart`)
      expect(restartResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(restartResponse)).status).toBe('ready')

      const patchResponse = await request.patch(`${dashboardBaseUrl}/api/mcps/${stdioId}`, {
        data: buildStdioDefinition({
          id: stdioId,
          name: 'API Stdio Updated',
          enabled: true,
          autoStart: false,
          startupTimeoutMs: 11_000
        })
      })
      expect(patchResponse.ok()).toBeTruthy()
      expect(await parseJson<{ definition: { name: string; startupTimeoutMs: number } }>(patchResponse)).toMatchObject({
        definition: {
          name: 'API Stdio Updated',
          startupTimeoutMs: 11_000
        }
      })

      const stopResponse = await request.post(`${dashboardBaseUrl}/api/mcps/${stdioId}/stop`)
      expect(stopResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(stopResponse)).status).toBe('stopped')

      const createRemoteResponse = await request.post(`${dashboardBaseUrl}/api/mcps`, {
        data: buildStreamableDefinition({
          id: remoteId,
          name: 'API Remote',
          url: remoteFixture.url
        })
      })
      expect(createRemoteResponse.ok()).toBeTruthy()
      expect((await parseJson<{ status: string }>(createRemoteResponse)).status).toBe('ready')

      const remoteGetResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${remoteId}`)
      expect(remoteGetResponse.ok()).toBeTruthy()
      expect(await parseJson<{ definition: { transport: string; id: string } }>(remoteGetResponse)).toMatchObject({
        definition: {
          id: remoteId,
          transport: 'streamable-http'
        }
      })

      const deleteStdioResponse = await request.delete(`${dashboardBaseUrl}/api/mcps/${stdioId}`)
      expect(deleteStdioResponse.status()).toBe(204)

      const deleteRemoteResponse = await request.delete(`${dashboardBaseUrl}/api/mcps/${remoteId}`)
      expect(deleteRemoteResponse.status()).toBe(204)

      const afterDeleteResponse = await request.get(`${dashboardBaseUrl}/api/mcps/${stdioId}`)
      expect(afterDeleteResponse.status()).toBe(404)
    } finally {
      await stopChild(remoteFixture.child)
    }
  })
})
