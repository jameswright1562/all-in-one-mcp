import { expect, test } from "@playwright/test";
import {
  ensureRuntimeReady,
  fixturePath,
  navigate,
  resetRuntime,
} from "./helpers";

test.describe("Fleet Management", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuntime(request);
  });

  test("shows empty state when no MCPs are configured", async ({ page }) => {
    await page.goto("/");
    await navigate(page, "Fleet");

    await expect(page.getByText("No fleet members")).toBeVisible();
    await expect(
      page.getByText(
        "Once MCP definitions are stored, their runtime cards will appear here.",
      ),
    ).toBeVisible();
  });

  test("displays MCP cards with correct information", async ({
    page,
    request,
  }) => {
    const id = `fleet-test-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Fleet Test Server",
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
    await navigate(page, "Fleet");
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Fleet Test Server" });

    // Verify card displays
    await expect(card).toContainText("Fleet Test Server");
    await expect(card.locator(".fleet-card__header")).toContainText("stdio");
    await expect(card).toContainText(id);
    await expect(card.locator(".fleet-card__status")).toContainText(
      /(Ready|Starting)/i,
    );

    // Verify stats are shown
    await expect(card.getByText("Prefix")).toBeVisible();
    await expect(card.getByText("Tools")).toBeVisible();
    await expect(card.getByText("Updated")).toBeVisible();
  });

  test("start action initiates MCP", async ({ page, request }) => {
    const id = `start-test-${Date.now()}`;

    // Create a stopped MCP
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Start Test Server",
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
    await navigate(page, "Fleet");

    // Find the card and click start
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Start Test Server" });
    await card
      .locator(".fleet-card__actions")
      .getByRole("button", { name: "Start", exact: true })
      .click();

    // Wait for status to change
    await page.waitForTimeout(1000);

    // Verify status updates (could be Starting or Ready)
    await expect(card.getByText(/(Starting|Ready)/i)).toBeVisible();
  });

  test("stop action stops MCP", async ({ page, request }) => {
    const id = `stop-test-${Date.now()}`;

    // Create an MCP
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Stop Test Server",
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
    await navigate(page, "Fleet");

    // Wait for MCP to be ready
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Stop Test Server" });
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 10000 });

    // Click stop
    await card
      .locator(".fleet-card__actions")
      .getByRole("button", { name: "Stop" })
      .click();

    // Wait for stopped status
    await expect(card.getByText(/Stopped/i)).toBeVisible({ timeout: 5000 });
  });

  test("restart action restarts MCP", async ({ page, request }) => {
    const id = `restart-test-${Date.now()}`;

    // Create an MCP
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Restart Test Server",
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
    await navigate(page, "Fleet");

    // Wait for MCP to be ready
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Restart Test Server" });
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 10000 });

    // Click restart
    await card
      .locator(".fleet-card__actions")
      .getByRole("button", { name: "Restart" })
      .click();

    // Status should temporarily change from Ready (Stopping/Starting) then back
    await expect(card.getByText(/(Stopping|Starting)/i)).toBeVisible({
      timeout: 5000,
    });

    // Eventually should be Ready again
    await expect(card.getByText(/Ready/i)).toBeVisible({ timeout: 15000 });
  });

  test("selecting card navigates to logs with MCP selected", async ({
    page,
    request,
  }) => {
    const id = `select-test-${Date.now()}`;

    // Create an MCP
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Select Test Server",
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
    await navigate(page, "Fleet");

    // Click on the card body to select
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Select Test Server" });
    await card.locator(".fleet-card__body").click();

    // Should navigate to logs section
    await expect(page.locator(".service-switch select")).toHaveValue(id);
  });

  test("shows last error when MCP has error state", async ({
    page,
    request,
  }) => {
    const id = `error-test-${Date.now()}`;

    // Create an MCP with a bad command that will fail
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Error Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 1000,
        transport: "stdio",
        command: "non-existent-command-12345",
        args: [],
        env: [],
      },
    });

    await page.goto("/");
    await navigate(page, "Fleet");

    // Wait for error state
    const card = page
      .locator(".fleet-card")
      .filter({ hasText: "Error Test Server" });
    await expect(card.locator(".fleet-card__status")).toContainText(/Error/i, {
      timeout: 5000,
    });
  });
});
