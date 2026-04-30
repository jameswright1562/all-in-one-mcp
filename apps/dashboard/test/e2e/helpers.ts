import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, type ChildProcess } from 'node:child_process'
import { expect, type Locator, type Page, type APIRequestContext, type APIResponse } from '@playwright/test'

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

export function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function titleCase(value: string): string {
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

export function parseCodexConfigMcps(configPath = codexConfigPath): CodexConfigMcp[] {
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

export async function createManagedMcp(
  request: APIRequestContext,
  definition: Record<string, unknown>
): Promise<void> {
  const response = await request.post(`${runtimeBaseUrl}/api/mcps`, {
    data: definition
  })

  expect(response.ok()).toBeTruthy()
}

export async function parseJson<T>(response: APIResponse): Promise<T> {
  return (await response.json()) as T
}

export function buildStdioDefinition(options: {
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

export function buildStreamableDefinition(options: {
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

export async function getManagedMcpStatus(request: APIRequestContext, id: string): Promise<string> {
  const response = await request.get(`${runtimeBaseUrl}/api/mcps/${id}`)

  if (!response.ok()) {
    return 'missing'
  }

  const payload = (await response.json()) as { status: string }
  return payload.status
}

export async function waitForManagedMcpStatus(
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

export async function openSection(page: Page, section: 'Fleet' | 'Config' | 'Logs' | 'Tools'): Promise<void> {
  await page.locator('.portal-nav__item').filter({ hasText: section }).click()
}

export async function selectService(page: Page, id: string): Promise<void> {
  await page.locator('.service-switch select').selectOption(id)
}

export function field(page: Page, label: string): Locator {
  return page
    .locator('label.field')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('input, textarea')
    .first()
}

export function fieldError(page: Page, label: string): Locator {
  return page.locator('label.field').filter({ has: page.getByText(label, { exact: true }) }).locator('em').first()
}

export function configItemsFromCodex(): CreatedMcp[] {
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

export async function startRemoteFixture(id: string, port: number): Promise<{ child: ChildProcess; url: string }> {
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

export async function stopChild(child: ChildProcess | undefined): Promise<void> {
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
