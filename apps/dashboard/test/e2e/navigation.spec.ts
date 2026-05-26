import { expect, test } from "./global-test";
import { logsHeading, sectionKicker } from "./helpers";

test.describe("Navigation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("sidebar navigation switches between sections", async ({ page }) => {
    await expect(logsHeading(page)).toBeVisible();

    await page.getByRole("button", { name: "Fleet" }).click();
    await expect(sectionKicker(page, "FLEET")).toBeVisible();
    await expect(page.getByText("Managed Runtime Targets")).toBeVisible();

    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();
    await expect(sectionKicker(page, "CONFIG")).toBeVisible();
    await expect(page.getByText("Add Managed MCP")).toBeVisible();

    await page.getByRole("button", { name: "Tools" }).click();
    await expect(sectionKicker(page, "TOOLS")).toBeVisible();
    await expect(page.getByText("Registered Tool Catalog")).toBeVisible();

    await page.getByRole("button", { name: "Logs" }).click();
    await expect(logsHeading(page)).toBeVisible();
  });

  test("sidebar shows active state for current section", async ({ page }) => {
    const fleetButton = page
      .locator(".portal-nav__item")
      .filter({ hasText: "Fleet" });
    const logsButton = page
      .locator(".portal-nav__item")
      .filter({ hasText: "Logs" });

    await expect(logsButton).toHaveClass(/is-active/);

    await fleetButton.click();
    await expect(fleetButton).toHaveClass(/is-active/);
    await expect(logsButton).not.toHaveClass(/is-active/);
  });

  test("brand card is visible in sidebar", async ({ page }) => {
    await expect(page.getByText("MCP Portal")).toBeVisible();
    await expect(page.getByText(">_")).toBeVisible();
  });
});
