import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from '@playwright/test'

const currentDir = dirname(fileURLToPath(import.meta.url))
const databasePath = resolve(currentDir, 'test-results', `dashboard-e2e-${Date.now()}.sqlite`)
const runtimePort = 4100
const dashboardPort = 4511
mkdirSync(dirname(databasePath), { recursive: true })

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${dashboardPort}`
  },
  webServer: {
    command: `node ../../packages/runtime/dist/cli.js serve --dashboard --port ${runtimePort} --dashboard-port ${dashboardPort} --database "${databasePath}"`,
    port: dashboardPort,
    timeout: 120_000,
    reuseExistingServer: true
  }
})
