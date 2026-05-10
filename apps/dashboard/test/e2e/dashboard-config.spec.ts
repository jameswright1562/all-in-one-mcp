import { expect, test } from '@playwright/test'
import {
  uniqueId,
  createManagedMcp,
  buildStdioDefinition,
  buildStreamableDefinition,
  startRemoteFixture,
  stopChild,
  openSection,
  selectService,
  field,
  fieldError
} from './helpers'

test.describe('dashboard config', () => {
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
      args: ['packages/runtime/test/fixtures/stdio-tool-server.mjs'],
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
    await field(page, 'Arguments').fill('packages/runtime/test/fixtures/stdio-tool-server.mjs')
    await page.getByRole('button', { name: 'Add MCP' }).click()

    await expect(page.getByText(`Tool prefix "${existingId}" is already in use.`)).toBeVisible()
  })
})
