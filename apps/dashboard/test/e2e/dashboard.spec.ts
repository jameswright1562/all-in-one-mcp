import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

test('renders the live logs portal for a managed MCP', async ({ page, request }) => {
  const fixturePath = resolve(fileURLToPath(new URL('../../../../packages/runtime/test/fixtures/stdio-tool-server.mjs', import.meta.url)))
  const id = `fixture-ui-${Date.now()}`

  await request.post('http://127.0.0.1:4100/api/mcps', {
    data: {
      id,
      name: 'Fixture UI',
      enabled: true,
      autoStart: true,
      toolPrefix: id,
      startupTimeoutMs: 5000,
      transport: 'stdio',
      command: process.execPath,
      args: [fixturePath],
      env: []
    }
  })

  await page.goto('/')

  await expect(page.getByText('LIVE LOGS')).toBeVisible()
  await expect(page.getByText(`${id}.service`)).toBeVisible()
  await expect(page.getByText('Managed MCP is ready.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pause Stream' })).toBeVisible()
})
