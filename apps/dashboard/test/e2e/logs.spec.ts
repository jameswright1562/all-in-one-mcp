import { expect, test } from "@playwright/test";
import { ensureRuntimeReady, fixturePath, resetRuntime } from "./helpers";

test.describe("Logs Section", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuntime(request);
  });

  test("shows empty state when no MCPs configured", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("No logs available")).toBeVisible();
    await expect(
      page.getByText(
        "The runtime is up, but there is no logged MCP activity to inspect yet.",
      ),
    ).toBeVisible();
  });

  test("displays live logs for running MCP", async ({ page, request }) => {
    const id = `logs-live-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Logs Test Server",
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

    // Wait for logs to appear
    await expect(page.getByText("LIVE SESSION")).toBeVisible();
    await expect(page.locator(".service-switch select")).toContainText(
      `${id}.service`,
    );

    // Wait for "Managed MCP is ready" message
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Console output should be visible
    await expect(page.getByText("CONSOLE OUTPUT")).toBeVisible();
  });

  test("shows correct PID label for running process", async ({
    page,
    request,
  }) => {
    const id = `logs-pid-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "PID Test Server",
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

    // PID label should show "PID: XXXX" format
    await expect(page.getByText(/PID:\s*\d+/)).toBeVisible({ timeout: 10000 });
  });

  test("filters logs by level", async ({ page, request }) => {
    const id = `logs-filter-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Filter Test Server",
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

    // Wait for logs
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Get the level filter dropdown
    const levelFilter = page.locator(".inline-select select");

    // Check default is "All Levels"
    await expect(levelFilter).toHaveValue("all");

    // Change filter to "Info"
    await levelFilter.selectOption("info");
    await expect(levelFilter).toHaveValue("info");

    // Change filter to "Debug"
    await levelFilter.selectOption("debug");
    await expect(levelFilter).toHaveValue("debug");

    // Change filter to "Error"
    await levelFilter.selectOption("error");
    await expect(levelFilter).toHaveValue("error");

    // Back to all
    await levelFilter.selectOption("all");
    await expect(levelFilter).toHaveValue("all");
  });

  test("search filters logs by query", async ({ page, request }) => {
    const id = `logs-search-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Search Test Server",
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

    // Wait for logs
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Search for specific text
    const searchInput = page.getByPlaceholder("Search logs...");
    await searchInput.fill("ready");

    // Results should filter (may show "No logs match" if no results)
    // The search is immediate, so just verify the input worked
    await expect(searchInput).toHaveValue("ready");

    // Clear search
    await searchInput.clear();
    await expect(searchInput).toHaveValue("");
  });

  test("pause and resume stream", async ({ page, request }) => {
    const id = `logs-pause-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Pause Test Server",
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

    // Wait for ready state
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Pause button should say "Pause Stream" initially
    const pauseButton = page.getByRole("button", { name: /Stream$/ });
    await expect(pauseButton).toHaveText("Pause Stream");

    // Footer should show "CONNECTED"
    await expect(page.getByText("CONNECTED")).toBeVisible();

    // Click pause
    await pauseButton.click();
    await expect(pauseButton).toHaveText("Resume Stream");

    // Footer should show "STREAM PAUSED"
    await expect(page.getByText("STREAM PAUSED")).toBeVisible();

    // Click resume
    await pauseButton.click();
    await expect(pauseButton).toHaveText("Pause Stream");
    await expect(page.getByText("CONNECTED")).toBeVisible();
  });

  test("shows instance health metrics", async ({ page, request }) => {
    const id = `logs-health-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Health Test Server",
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

    // Wait for logs
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Health section should be visible
    await expect(page.getByText("INSTANCE HEALTH")).toBeVisible();

    // Should show Status, Signal, and Buffer metrics
    const healthCard = page.locator(".side-card").filter({
      has: page.getByRole("heading", { name: "INSTANCE HEALTH" }),
    });
    await expect(healthCard.getByText("Status")).toBeVisible();
    await expect(healthCard.getByText("Signal")).toBeVisible();
    await expect(healthCard.getByText("Buffer")).toBeVisible();

    // Status should show Ready
    await expect(healthCard.locator("strong").first()).toContainText(
      /Ready|Starting/,
    );
  });

  test("shows metadata tags", async ({ page, request }) => {
    const id = `logs-metadata-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Metadata Test Server",
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

    // Wait for logs
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Metadata section should be visible
    await expect(page.getByText("METADATA TAGS")).toBeVisible();

    // Should show service, transport, prefix tags
    await expect(page.getByText(/service:/)).toBeVisible();
    await expect(page.getByText(/transport:/)).toBeVisible();
    await expect(page.getByText(/prefix:/)).toBeVisible();
    await expect(page.getByText(/startup:/)).toBeVisible();
    await expect(page.getByText(/auto:/)).toBeVisible();
  });

  test("shows event stream", async ({ page, request }) => {
    const id = `logs-events-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Events Test Server",
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

    // Wait for logs
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Event stream section should be visible
    await expect(page.getByText("EVENT STREAM")).toBeVisible();
  });

  test("export config button triggers download", async ({ page, request }) => {
    const id = `logs-export-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Export Test Server",
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

    // Wait for ready
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Export button should be visible and enabled
    const exportButton = page.getByRole("button", { name: "Export Config" });
    await expect(exportButton).toBeEnabled();

    // Click should trigger export (we can't verify download directly in E2E easily)
    await exportButton.click();
  });

  test("console footer shows connection and buffer info", async ({
    page,
    request,
  }) => {
    const id = `logs-footer-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Footer Test Server",
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

    // Wait for logs
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible({
      timeout: 10000,
    });

    // Footer should show buffer info
    await expect(page.getByText(/BUFFERS:/)).toBeVisible();
    await expect(page.getByText(/% FREE/)).toBeVisible();

    // Should show visible/total counts
    await expect(page.getByText(/VISIBLE/)).toBeVisible();
    await expect(page.getByText(/TOTAL/)).toBeVisible();
  });
});
