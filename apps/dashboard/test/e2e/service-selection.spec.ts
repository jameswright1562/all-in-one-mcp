import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./global-test";
import { navItem } from "./helpers";

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

    const serviceSwitcher = page.locator(".service-switch select");
    await expect(serviceSwitcher).toHaveValue("");
    await expect(serviceSwitcher).toBeDisabled();

    // Should show "All Services" option
    await expect(page.getByText("All Services")).toBeVisible();
  });

  test("service switcher populates with MCP options", async ({
    page,
    request,
  }) => {
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
    const serviceSwitcher = page.locator(".service-switch select");
    await expect(serviceSwitcher).toBeEnabled();

    // Should show the service option with .service suffix
    await expect(page.locator(".service-switch select")).toContainText(
      `${id}.service`,
    );
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
    await expect(page.locator(".service-switch select")).toContainText(
      `${id1}.service`,
    );

    // Switch to second service
    await page.locator(".service-switch select").selectOption(id2);

    // Logs should update to show second service
    await expect(page.locator(".service-switch select")).toContainText(
      `${id2}.service`,
    );
  });

  test("selecting service in config navigates to edit mode", async ({
    page,
    request,
  }) => {
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
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    // Initially in create mode
    await expect(page.getByText("Add Managed MCP")).toBeVisible();

    // Select a service
    await page.locator(".service-switch select").selectOption(id);

    // Should automatically switch to edit mode
    await expect(page.getByText("Edit Managed MCP")).toBeVisible();
    await expect(page.getByText("Editing Service Config Test")).toBeVisible();
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
    await expect(page.locator(".service-switch select")).toContainText(
      `${id1}.service`,
    );
    await expect(page.locator(".service-switch select")).toContainText(
      `${id2}.service`,
    );
    await expect(page.locator(".service-switch select")).toContainText(
      `${id3}.service`,
    );

    // MCP count in avatar should show 3
    await expect(page.getByText("3 MCP")).toBeVisible();
  });

  test("service remains selected after navigation between sections", async ({
    page,
    request,
  }) => {
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
    await page.locator(".service-switch select").selectOption(id);

    // Navigate to Fleet
    await navItem(page, "Fleet").click();

    // Service should still be selected
    await expect(page.locator(".service-switch select")).toHaveValue(id);

    // Navigate to Tools
    await navItem(page, "Tools").click();
    await expect(page.locator(".service-switch select")).toHaveValue(id);

    // Navigate back to Logs
    await navItem(page, "Logs").click();
    await expect(page.locator(".service-switch select")).toHaveValue(id);
  });
});
