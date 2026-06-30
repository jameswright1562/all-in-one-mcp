import { expect, test } from "@playwright/test";
import {
  ensureRuntimeReady,
  fixturePath,
  navigate,
  resetRuntime,
} from "./helpers";

test.describe("MCP Lifecycle Integration", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuntime(request);
  });

  test("full lifecycle: create, start, view logs, stop, delete", async ({
    page,
    request,
  }) => {
    const id = `lifecycle-${Date.now()}`;

    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Lifecycle Test Server",
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
    await expect(page.locator(".profile-avatar")).toHaveText("1 MCP");

    // Step 2: Navigate to Fleet and verify MCP is listed
    await navigate(page, "Fleet");
    await expect(page.getByText("Lifecycle Test Server")).toBeVisible();

    // Step 3: View logs - should be running
    await navigate(page, "Logs");
    await page.locator(".service-switch select").selectOption(id);
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Step 4: Navigate to Tools and verify tools are exposed
    await navigate(page, "Tools");
    await expect(page.getByText(/\d+ tools exposed/)).toBeVisible();

    // Step 5: Stop the MCP from Fleet
    await navigate(page, "Fleet");
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Lifecycle Test Server" });
    await card
      .locator(".fleet-card__actions")
      .getByRole("button", { name: "Stop" })
      .click();

    // Verify stopped status
    await expect(card.getByText(/Stopped/i)).toBeVisible({ timeout: 5000 });

    // Step 6: Tools should now show empty state
    await navigate(page, "Tools");
    await expect(page.getByText("No tools discovered")).toBeVisible();

    // Step 7: Restart the MCP
    await navigate(page, "Fleet");
    await card
      .locator(".fleet-card__actions")
      .getByRole("button", { name: "Start", exact: true })
      .click();

    // Wait for ready status
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 15000 });

    // Step 8: Delete the MCP via API
    await ensureRuntimeReady(request);
    await request.delete(`http://127.0.0.1:4100/api/mcps/${id}`);

    // Step 9: Verify it's gone from Fleet
    await page.reload();
    await navigate(page, "Fleet");
    await expect(page.getByText("No fleet members")).toBeVisible();
  });

  test("edit configuration and verify changes apply", async ({
    page,
    request,
  }) => {
    const id = `edit-lifecycle-${Date.now()}`;

    // Create initial MCP
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Original Name",
        enabled: true,
        autoStart: true,
        toolPrefix: "original-prefix",
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: process.execPath,
        args: [fixturePath],
        env: [],
      },
    });

    await page.goto("/");

    // Select the MCP
    await page.locator(".service-switch select").selectOption(id);

    // Go to Config and enter edit mode
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();
    await page.getByRole("button", { name: "Edit Selected" }).click();

    // Update name
    const nameInput = page.getByPlaceholder("Playwright MCP");
    await nameInput.clear();
    await nameInput.fill("Updated Name");

    // Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByRole("textbox", { name: /^name/i })).toHaveValue(
      "Updated Name",
    );

    await expect(page.getByRole("textbox", { name: /^name/i })).toHaveValue(
      "Updated Name",
    );
  });

  test("create streamable-http MCP and view in fleet", async ({
    page,
    request,
  }) => {
    const id = `http-lifecycle-${Date.now()}`;

    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "HTTP Test Server",
        enabled: true,
        autoStart: false,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "streamable-http",
        url: "http://localhost:3000/mcp",
        headers: [],
      },
    });

    await page.goto("/");
    await expect(page.locator(".profile-avatar")).toHaveText("1 MCP");

    // View in Fleet
    await navigate(page, "Fleet");

    // Should show streamable-http transport
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "HTTP Test Server" });
    await expect(card.getByText("streamable-http")).toBeVisible();
  });

  test("service count in header updates correctly", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    // Initially should show 0 MCP
    await expect(page.locator(".profile-avatar")).toHaveText("0 MCP");

    // Create first MCP
    const id1 = `count-1-${Date.now()}`;
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id: id1,
        name: "Count Test 1",
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

    await page.reload();
    await expect(page.locator(".profile-avatar")).toHaveText("1 MCP");

    // Create second MCP
    const id2 = `count-2-${Date.now()}`;
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id: id2,
        name: "Count Test 2",
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

    await page.reload();
    await expect(page.locator(".profile-avatar")).toHaveText("2 MCP");

    // Delete one
    await request.delete(`http://127.0.0.1:4100/api/mcps/${id1}`);

    await page.reload();
    await expect(page.locator(".profile-avatar")).toHaveText("1 MCP");
  });
});
