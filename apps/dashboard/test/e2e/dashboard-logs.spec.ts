import { expect, test } from '@playwright/test'
import {
  uniqueId,
  createManagedMcp,
  buildStdioDefinition,
  waitForManagedMcpStatus,
  openSection,
  selectService,
  field
} from './helpers'

const dashboardBaseUrl = 'http://127.0.0.1:4511'
const runtimeBaseUrl = 'http://127.0.0.1:4100'
const stdioFixturePath = 'packages/runtime/test/fixtures/stdio-tool-server.mjs'

test.describe('dashboard logs', () => {
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

    // After the restart, the new log lines should cause the console to scroll to the bottom
    await expect
      .poll(async () => {
        const scrollTop = await consoleBody.evaluate((el) => el.scrollTop)
        const scrollHeight = await consoleBody.evaluate((el) => el.scrollHeight)
        const clientHeight = await consoleBody.evaluate((el) => el.clientHeight)
        return scrollHeight - scrollTop - clientHeight
      }, { timeout: 10_000 })
      .toBeLessThanOrEqual(2)
  })
})
