import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./global-test";
import { lifecycleMessage } from "./helpers";

const fixturePath = resolve(
  fileURLToPath(
    new URL(
      "../../../../packages/runtime/test/fixtures/stdio-tool-server.mjs",
      import.meta.url,
    ),
  ),
);

test.describe("Tools Section", () => {
  test("shows empty state when no MCPs configured", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();

    await expect(page.getByText("No tools discovered")).toBeVisible();
    await expect(
      page.getByText(
        "Start the selected MCP and its exposed tool catalog will be listed here.",
      ),
    ).toBeVisible();
  });

  test("shows empty state when MCP is not ready", async ({ page, request }) => {
    const id = `tools-notready-${Date.now()}`;

    // Create an MCP that doesn't auto-start
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Tools Not Ready Server",
        enabled: true,
        autoStart: false,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");
    await page.getByRole("button", { name: "Tools" }).click();

    // Should still show empty state because MCP isn't started
    await expect(page.getByText("No tools discovered")).toBeVisible();
  });

  test("displays tool cards for ready MCP", async ({ page, request }) => {
    const id = `tools-ready-${Date.now()}`;

    // Create an MCP via API
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Tools Ready Server",
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

    // Wait for MCP to be ready
    await expect(lifecycleMessage(page, "Managed MCP is ready.")).toBeVisible({
      timeout: 10000,
    });

    // Navigate to Tools
    await page.getByRole("button", { name: "Tools" }).click();

    // Tools section should show count
    await expect(page.getByText(/\d+ tools exposed/)).toBeVisible();

    // The fixture server has an "echo" tool
    await expect(page.getByText(/echo/)).toBeVisible();
  });

  test("tool cards display correct information", async ({ page, request }) => {
    const id = `tools-info-${Date.now()}`;

    // Create an MCP via API
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Tools Info Server",
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

    // Wait for MCP to be ready
    await expect(lifecycleMessage(page, "Managed MCP is ready.")).toBeVisible({
      timeout: 10000,
    });

    // Navigate to Tools
    await page.getByRole("button", { name: "Tools" }).click();

    // Tool card should show the echo tool with its details
    const toolCard = page.locator(".tool-card").first();
    await expect(toolCard).toBeVisible();

    // Should show transport and prefix in footer
    await expect(toolCard.getByText("stdio", { exact: true })).toBeVisible();
    await expect(toolCard.getByText(id)).toBeVisible();
  });

  test("tools update when switching MCPs", async ({ page, request }) => {
    const id1 = `tools-mcp1-${Date.now()}`;
    const id2 = `tools-mcp2-${Date.now()}`;

    // Create first MCP
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id: id1,
        name: "Tools MCP 1",
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

    // Create second MCP
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id: id2,
        name: "Tools MCP 2",
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

    // Wait for first MCP to be ready
    await expect(lifecycleMessage(page, "Managed MCP is ready.")).toBeVisible({
      timeout: 10000,
    });

    // Navigate to Tools
    await page.getByRole("button", { name: "Tools" }).click();

    // Should show tools
    await expect(page.getByText(/tools exposed/)).toBeVisible();

    // Switch to second MCP via service switcher
    await page.locator(".service-switch select").selectOption(id2);

    // Tools should still be visible (both have same tools)
    await expect(page.getByText(/tools exposed/)).toBeVisible();
  });
});
