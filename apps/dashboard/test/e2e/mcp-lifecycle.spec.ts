import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "./global-test";
import { lifecycleMessage, navItem } from "./helpers";

const fixturePath = resolve(
  fileURLToPath(
    new URL(
      "../../../../packages/runtime/test/fixtures/stdio-tool-server.mjs",
      import.meta.url,
    ),
  ),
);

test.describe("MCP Lifecycle Integration", () => {
  test("full lifecycle: create, start, view logs, stop, delete", async ({
    page,
    request,
  }) => {
    const id = `lifecycle-${Date.now()}`;

    // Step 1: Create MCP via UI
    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    await page.getByPlaceholder("playwright").first().fill(id);
    await page.getByPlaceholder("Playwright MCP").fill("Lifecycle Test Server");
    await page.getByPlaceholder("npx").fill(process.execPath);
    await page.getByPlaceholder("-y").fill(fixturePath);

    await page.getByRole("button", { name: "Add MCP" }).click();

    // Wait for success message
    await expect(page.getByText(/added to the fleet/)).toBeVisible({
      timeout: 10000,
    });

    // Step 2: Navigate to Fleet and verify MCP is listed
    await navItem(page, "Fleet").click();
    await expect(page.getByText("Lifecycle Test Server")).toBeVisible();

    // Step 3: View logs - should be running
    await navItem(page, "Logs").click();
    await expect(page.locator(".service-switch select")).toContainText(
      `${id}.service`,
    );
    await expect(lifecycleMessage(page, "Managed MCP is ready.")).toBeVisible({
      timeout: 10000,
    });

    // Step 4: Navigate to Tools and verify tools are exposed
    await navItem(page, "Tools").click();
    await expect(page.getByText(/\d+ tools exposed/)).toBeVisible();

    // Step 5: Stop the MCP from Fleet
    await navItem(page, "Fleet").click();
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Lifecycle Test Server" });
    await card.getByRole("button", { name: "Stop" }).click();

    // Verify stopped status
    await expect(card.getByText(/Stopped/i)).toBeVisible({ timeout: 5000 });

    // Step 6: Tools should now show empty state
    await navItem(page, "Tools").click();
    await expect(page.getByText("No tools discovered")).toBeVisible();

    // Step 7: Restart the MCP
    await navItem(page, "Fleet").click();
    await card.getByRole("button", { name: "Start" }).click();

    // Wait for ready status
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 15000 });

    // Step 8: Delete the MCP via API
    await request.delete(`http://127.0.0.1:4100/api/mcps/${id}`);

    // Step 9: Verify it's gone from Fleet
    await page.reload();
    await navItem(page, "Fleet").click();
    await expect(page.getByText("No fleet members")).toBeVisible();
  });

  test("edit configuration and verify changes apply", async ({
    page,
    request,
  }) => {
    const id = `edit-lifecycle-${Date.now()}`;

    // Create initial MCP
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
    await expect(page.getByText(/updated successfully/)).toBeVisible({
      timeout: 5000,
    });

    // Verify in Fleet
    await navItem(page, "Fleet").click();
    await expect(page.getByText("Updated Name")).toBeVisible();
    await expect(page.getByText("Original Name")).not.toBeVisible();
  });

  test("create streamable-http MCP and view in fleet", async ({ page }) => {
    const id = `http-lifecycle-${Date.now()}`;

    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    // Fill form for HTTP transport
    await page.getByPlaceholder("playwright").first().fill(id);
    await page.getByPlaceholder("Playwright MCP").fill("HTTP Test Server");

    // Switch to streamable-http
    await page.getByRole("button", { name: "streamable-http" }).click();
    await page
      .getByPlaceholder("http://127.0.0.1:4100/mcp")
      .fill("http://localhost:3000/mcp");

    // Disable auto-start for HTTP MCP
    const autoStartCheckbox = page.locator("input[type='checkbox']").nth(1);
    await autoStartCheckbox.click();

    await page.getByRole("button", { name: "Add MCP" }).click();

    // Wait for success
    await expect(page.getByText(/added to the fleet/)).toBeVisible({
      timeout: 5000,
    });

    // View in Fleet
    await navItem(page, "Fleet").click();

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
    await expect(page.getByText("0 MCP")).toBeVisible();

    // Create first MCP
    const id1 = `count-1-${Date.now()}`;
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
    await expect(page.getByText("1 MCP")).toBeVisible();

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
    await expect(page.getByText("2 MCP")).toBeVisible();

    // Delete one
    await request.delete(`http://127.0.0.1:4100/api/mcps/${id1}`);

    await page.reload();
    await expect(page.getByText("1 MCP")).toBeVisible();
  });
});
