import { expect, test } from "@playwright/test";
import { ensureRuntimeReady, fixturePath, resetRuntime } from "./helpers";

test.describe("Dashboard Basic", () => {
  test.beforeEach(async ({ request }) => {
    await resetRuntime(request);
  });

  test("page loads with correct title and branding", async ({ page }) => {
    await page.goto("/");

    // Branding
    await expect(page.getByText("MCP Portal")).toBeVisible();
    await expect(page.getByText("V2.4 ACTIVE")).toBeVisible();
    await expect(page.getByText(">_")).toBeVisible();

    // Default section (Logs)
    await expect(page.getByText("LIVE LOGS")).toBeVisible();
  });

  test("renders the live logs portal for a managed MCP", async ({
    page,
    request,
  }) => {
    const id = `fixture-ui-${Date.now()}`;

    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Fixture UI",
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

    await expect(page.getByText("LIVE LOGS")).toBeVisible();
    await expect(page.locator(".service-switch select")).toContainText(
      `${id}.service`,
    );
    await expect(page.getByText("Managed MCP is ready.").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Pause Stream" }),
    ).toBeVisible();
  });

  test("shows loading state initially", async ({ page }) => {
    await page.goto("/");

    // Loading state should appear briefly then disappear
    await expect(
      page.getByText("Loading portal data", { exact: false }),
    ).not.toBeVisible({ timeout: 5000 });
  });

  test("sidebar navigation has all sections", async ({ page }) => {
    await page.goto("/");

    // Verify all nav items exist
    await expect(page.getByRole("button", { name: "Fleet" })).toBeVisible();
    await expect(
      page.locator(".portal-nav__item").filter({ hasText: "Config" }).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Logs" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tools" })).toBeVisible();
  });

  test("topbar has search and theme controls", async ({ page }) => {
    await page.goto("/");

    // Search input
    await expect(page.getByPlaceholder("Search logs...")).toBeVisible();

    // Theme toggle
    await expect(page.getByRole("button", { name: /Mode$/ })).toBeVisible();

    // Service switcher
    await expect(page.locator(".service-switch select")).toBeVisible();
  });

  test("footer caption is visible in sidebar", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText(
        "Local runtime control for managed MCP instances and shared tool gateways.",
      ),
    ).toBeVisible();
  });
});
