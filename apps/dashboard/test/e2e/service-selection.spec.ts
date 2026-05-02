import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const fixturePath = resolve(
  fileURLToPath(
    new URL(
      "../../../../packages/runtime/test/fixtures/stdio-tool-server.mjs",
      import.meta.url,
    ),
  ),
);

test.describe("Service Selection", () => {
  test("service switcher shows empty state when no MCPs", async ({ page }) => {
    await page.goto("/");

    const serviceSwitcher = page.locator("select");
    await expect(serviceSwitcher).toHaveValue("");
    await expect(serviceSwitcher).toBeDisabled();

    // Should show "No active service" option
    await expect(page.getByText("No active service")).toBeVisible();
  });

  test("service switcher populates with MCP options", async ({ page, request }) => {
    const id = `service-select-${Date.now()}`;

    // Create an MCP via API
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Service Select Test",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");

    // Service switcher should be enabled and show the MCP
    const serviceSwitcher = page.locator("select");
    await expect(serviceSwitcher).toBeEnabled();

    // Should show the service option with .service suffix
    await expect(page.getByText(`${id}.service`)).toBeVisible();
  });

  test("selecting service updates logs view", async ({ page, request }) => {
    const id1 = `service-logs1-${Date.now()}`;
    const id2 = `service-logs2-${Date.now()}`;

    // Create first MCP
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id: id1,
        name: "Service Logs 1",
        enabled: true,
        autoStart: true,
        toolPrefix: id1,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    // Wait a bit to ensure different timestamps
    await page.waitForTimeout(100);

    // Create second MCP
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id: id2,
        name: "Service Logs 2",
        enabled: true,
        autoStart: true,
        toolPrefix: id2,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");

    // Wait for first MCP logs to appear
    await expect(page.getByText(`${id1}.service`)).toBeVisible({ timeout: 10000 });

    // Switch to second service
    await page.locator("select").selectOption(id2);

    // Logs should update to show second service
    await expect(page.getByText(`${id2}.service`)).toBeVisible();
  });

  test("selecting service in config navigates to edit mode", async ({ page, request }) => {
    const id = `service-config-${Date.now()}`;

    // Create an MCP via API
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Service Config Test",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Config" }).click();

    // Initially in create mode
    await expect(page.getByText("Add Managed MCP")).toBeVisible();

    // Select a service
    await page.locator("select").selectOption(id);

    // Should automatically switch to edit mode
    await expect(page.getByText("Edit Managed MCP")).toBeVisible();
    await expect(page.getByText(`Editing ${id}`)).toBeVisible();
  });

  test("service switcher shows multiple MCPs", async ({ page, request }) => {
    const id1 = `multi-1-${Date.now()}`;
    const id2 = `multi-2-${Date.now()}`;
    const id3 = `multi-3-${Date.now()}`;

    // Create multiple MCPs
    for (const id of [id1, id2, id3]) {
      await request.post("http://127.0.0.1:4100/api/mcps", {
        data: {
          id,
          name: `Multi Test ${id}`,
          enabled: true,
          autoStart: true,
          toolPrefix: id,
          startupTimeoutMs: 5000,
          transport: "stdio",
          command: process.execPath,
          args: [fixturePath],
          env: [],
        },
      });
    }

    await page.goto("/");

    // All services should appear in the dropdown
    await expect(page.getByText(`${id1}.service`)).toBeVisible();
    await expect(page.getByText(`${id2}.service`)).toBeVisible();
    await expect(page.getByText(`${id3}.service`)).toBeVisible();

    // MCP count in avatar should show 3
    await expect(page.getByText("3 MCP")).toBeVisible();
  });

  test("service remains selected after navigation between sections", async ({ page, request }) => {
    const id = `nav-persist-${Date.now()}`;

    // Create an MCP via API
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Nav Persist Test",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");

    // Select the service
    await page.locator("select").selectOption(id);

    // Navigate to Fleet
    await page.getByRole("button", { name: "Fleet" }).click();

    // Service should still be selected
    await expect(page.locator("select")).toHaveValue(id);

    // Navigate to Tools
    await page.getByRole("button", { name: "Tools" }).click();
    await expect(page.locator("select")).toHaveValue(id);

    // Navigate back to Logs
    await page.getByRole("button", { name: "Logs" }).click();
    await expect(page.locator("select")).toHaveValue(id);
  });
});
