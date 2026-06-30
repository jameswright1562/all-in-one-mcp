import { expect, test } from "@playwright/test";
import { navigate, resetRuntime } from "./helpers";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetRuntime(request);
    await page.goto("/");
  });

  test("sidebar navigation switches between sections", async ({ page }) => {
    // Verify initial state - Logs section is active by default
    await expect(page.getByText("LIVE LOGS")).toBeVisible();

    // Navigate to Fleet section
    await navigate(page, "Fleet");
    await expect(page.locator(".section-title h2")).toHaveText(
      "Managed Runtime Targets",
    );

    // Navigate to Config section
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();
    await expect(page.locator(".section-title h2")).toHaveText(
      "Add Managed MCP",
    );
    await expect(page.getByText("Add Managed MCP")).toBeVisible();

    // Navigate to Tools section
    await page.getByRole("button", { name: "Tools" }).click();
    await expect(page.locator(".section-title h2")).toHaveText(
      "Registered Tool Catalog",
    );

    // Navigate back to Logs
    await page.getByRole("button", { name: "Logs" }).click();
    await expect(page.getByText("LIVE LOGS")).toBeVisible();
  });

  test("sidebar shows active state for current section", async ({ page }) => {
    const fleetButton = page
      .locator(".portal-nav__item")
      .filter({ hasText: "Fleet" })
      .first();
    const logsButton = page
      .locator(".portal-nav__item")
      .filter({ hasText: "Logs" })
      .first();

    // Check that Logs button has active class initially
    await expect(logsButton).toHaveClass(/is-active/);

    // Click Fleet and verify it becomes active
    await fleetButton.click();
    await expect(fleetButton).toHaveClass(/is-active/);
    await expect(logsButton).not.toHaveClass(/is-active/);
  });

  test("brand card is visible in sidebar", async ({ page }) => {
    await expect(page.getByText("MCP Portal")).toBeVisible();
    await expect(page.getByText(">_")).toBeVisible();
  });
});
