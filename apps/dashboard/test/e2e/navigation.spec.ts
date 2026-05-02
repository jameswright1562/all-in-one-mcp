import { expect, test } from "@playwright/test";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("sidebar navigation switches between sections", async ({ page }) => {
    // Verify initial state - Logs section is active by default
    await expect(page.getByText("LIVE LOGS")).toBeVisible();

    // Navigate to Fleet section
    await page.getByRole("button", { name: "Fleet" }).click();
    await expect(page.getByText("FLEET")).toBeVisible();
    await expect(page.getByText("Managed Runtime Targets")).toBeVisible();

    // Navigate to Config section
    await page.getByRole("button", { name: "Config" }).click();
    await expect(page.getByText("CONFIG")).toBeVisible();
    await expect(page.getByText("Add Managed MCP")).toBeVisible();

    // Navigate to Tools section
    await page.getByRole("button", { name: "Tools" }).click();
    await expect(page.getByText("TOOLS")).toBeVisible();
    await expect(page.getByText("Registered Tool Catalog")).toBeVisible();

    // Navigate back to Logs
    await page.getByRole("button", { name: "Logs" }).click();
    await expect(page.getByText("LIVE LOGS")).toBeVisible();
  });

  test("sidebar shows active state for current section", async ({ page }) => {
    const fleetButton = page.getByRole("button", { name: "Fleet" });
    const logsButton = page.getByRole("button", { name: "Logs" });

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
