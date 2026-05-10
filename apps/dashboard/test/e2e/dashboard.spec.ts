import { expect, test } from '@playwright/test'
import {
  uniqueId,
  titleCase,
  createManagedMcp,
  parseJson,
  buildStdioDefinition,
  buildStreamableDefinition,
  getManagedMcpStatus,
  waitForManagedMcpStatus,
  openSection,
  selectService,
  field,
  fieldError,
  configItemsFromCodex,
  startRemoteFixture,
  stopChild
} from './helpers'

const dashboardBaseUrl = 'http://127.0.0.1:4511'
const runtimeBaseUrl = 'http://127.0.0.1:4100'

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
    test.skip(items.length === 0, `No Codex MCP entries found.`)

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
})
