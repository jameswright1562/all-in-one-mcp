import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const currentDir = dirname(fileURLToPath(import.meta.url));
const databasePath = resolve(
  currentDir,
  "test-results",
  "dashboard-e2e.sqlite",
);
rmSync(databasePath, { force: true });
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  testDir: "./test/e2e",
  timeout: 60_000,
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
      command: "pnpm dev --port 4311",
      port: 4311,
      reuseExistingServer: true,
      env: {
        ALL_IN_ONE_MCP_RUNTIME_URL: "http://127.0.0.1:4100",
      },
    },
  ],
});
