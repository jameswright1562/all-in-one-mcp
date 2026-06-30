import { expect, test } from "@playwright/test";

test.describe("Theme", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("theme toggle switches between light and dark mode", async ({
    page,
  }) => {
    const themeButton = page.getByRole("button", { name: /Mode$/ });

    // Initially should show "Dark Mode" (light mode is active)
    await expect(themeButton).toHaveText("Dark Mode");

    // Click to switch to dark mode
    await themeButton.click();
    await expect(themeButton).toHaveText("Light Mode");

    // Verify the theme attribute is set on the document
    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(theme).toBe("dark");

    // Click to switch back to light mode
    await themeButton.click();
    await expect(themeButton).toHaveText("Dark Mode");

    const lightTheme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(lightTheme).toBe("light");
  });

  test("theme preference persists after page reload", async ({ page }) => {
    const themeButton = page.getByRole("button", { name: /Mode$/ });

    // Switch to dark mode
    await themeButton.click();
    await expect(themeButton).toHaveText("Light Mode");

    // Reload the page
    await page.reload();
    await page.waitForLoadState("load");

    // Verify theme persists
    const persistedThemeButton = page.getByRole("button", { name: /Mode$/ });
    await expect(persistedThemeButton).toHaveText("Light Mode");

    const theme = await page.evaluate(
      () => document.documentElement.dataset.theme,
    );
    expect(theme).toBe("dark");
  });
});
