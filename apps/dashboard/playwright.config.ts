import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(
  currentDir,
  "test-results",
  `dashboard-e2e-${process.pid}-${Date.now()}.sqlite`,
);
rmSync(databasePath, { force: true });
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  reporter: [["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: "http://127.0.0.1:4311",
  },
  webServer: [
    {
      command: `node ../../packages/runtime/dist/cli.js serve --port 4100 --database "${databasePath}"`,
      port: 4100,
      reuseExistingServer: true,
    },
    {
      command: "pnpm build && node .output/server/index.mjs",
      port: 4311,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        ALL_IN_ONE_MCP_RUNTIME_URL: "http://127.0.0.1:4100",
        HOST: "127.0.0.1",
        PORT: "4311",
        NITRO_HOST: "127.0.0.1",
        NITRO_PORT: "4311",
      },
    },
  ],
});
