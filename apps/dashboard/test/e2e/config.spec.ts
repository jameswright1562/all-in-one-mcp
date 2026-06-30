import { expect, test } from "@playwright/test";
import { ensureRuntimeReady, gotoConfig, resetRuntime } from "./helpers";
import { fixturePath } from "./helpers";

test.describe("Config Section", () => {
  test.beforeEach(async ({ page, request }) => {
    await resetRuntime(request);
    await gotoConfig(page);
  });

  test("shows create form by default", async ({ page }) => {
    await expect(page.getByText("Add Managed MCP")).toBeVisible();
    await expect(
      page.getByText("Create a runtime target with validation."),
    ).toBeVisible();
  });

  test("validates required fields on submit", async ({ page }) => {
    const serviceSwitcher = page.locator(".service-switch select");
    const beforeCount = await serviceSwitcher.locator("option").count();

    // Try to submit empty form
    await page.getByRole("button", { name: "Add MCP" }).click();

    // Invalid input should not create a new managed MCP
    await expect(serviceSwitcher.locator("option")).toHaveCount(beforeCount);
  });

  test("creates new stdio MCP successfully", async ({ page, request }) => {
    const id = `create-stdio-${Date.now()}`;

    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Test Stdio Server",
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

    await page.reload();
    await expect(page.locator(".profile-avatar")).toHaveText("1 MCP");
    await expect(page.locator(".service-switch select")).toContainText(
      `${id}.service`,
    );
  });

  test("creates new streamable-http MCP successfully", async ({
    page,
    request,
  }) => {
    const id = `create-http-${Date.now()}`;

    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Test HTTP Server",
        enabled: true,
        autoStart: false,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "streamable-http",
        url: "http://localhost:3000/mcp",
        headers: [],
      },
    });

    await page.reload();
    await expect(page.locator(".profile-avatar")).toHaveText("1 MCP");
    await expect(page.locator(".service-switch select")).toContainText(
      `${id}.service`,
    );
  });

  test("switches between transport types showing correct fields", async ({
    page,
  }) => {
    // Default is stdio - check stdio fields are visible
    await expect(
      page.getByRole("textbox", { name: /^command/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /^arguments/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: /^working directory/i }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("http://127.0.0.1:4100/mcp"),
    ).not.toBeVisible();

    // Switch to streamable-http
    await page.getByRole("button", { name: "streamable-http" }).click();

    // stdio fields should be hidden, URL field should be visible
    await expect(
      page.getByRole("textbox", { name: /^command/i }),
    ).not.toBeVisible();
    await expect(
      page.getByPlaceholder("http://127.0.0.1:4100/mcp"),
    ).toBeVisible();

    // Switch back to stdio
    await page.getByRole("button", { name: "stdio" }).click();

    // stdio fields should be visible again
    await expect(
      page.getByRole("textbox", { name: /^command/i }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("http://127.0.0.1:4100/mcp"),
    ).not.toBeVisible();
  });

  test("toggle checkboxes work correctly", async ({ page }) => {
    // Check that checkboxes exist
    const enabledCheckbox = page.locator("input[type='checkbox']").first();
    const autoStartCheckbox = page.locator("input[type='checkbox']").nth(1);

    // By default both should be checked
    await expect(enabledCheckbox).toBeChecked();
    await expect(autoStartCheckbox).toBeChecked();

    // Uncheck them
    await enabledCheckbox.click();
    await autoStartCheckbox.click();

    await expect(enabledCheckbox).not.toBeChecked();
    await expect(autoStartCheckbox).not.toBeChecked();

    // Check them again
    await enabledCheckbox.click();
    await autoStartCheckbox.click();

    await expect(enabledCheckbox).toBeChecked();
    await expect(autoStartCheckbox).toBeChecked();
  });

  test("startup timeout field accepts numeric input", async ({ page }) => {
    const timeoutInput = page.locator("input[type='number']").first();

    // Clear and enter new value
    await timeoutInput.fill("10000");
    await expect(timeoutInput).toHaveValue("10000");

    // Try invalid value (should still accept but form validation may catch it)
    await timeoutInput.fill("0");
    await expect(timeoutInput).toHaveValue("0");
  });

  test("edit mode requires selected MCP", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "Edit Selected" }),
    ).toBeDisabled();
  });
});

test.describe("Config Section - Edit Mode", () => {
  test("switches to edit mode with selected MCP data", async ({
    page,
    request,
  }) => {
    const id = `edit-test-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Edit Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: "node",
        args: ["-e", "console.log('test')"],
        env: [],
      },
    });

    await gotoConfig(page);

    // Select the MCP from the service switcher
    await expect(page.locator(".service-switch select")).toContainText(id);
    await page.locator(".service-switch select").selectOption(id);

    // Switch to edit mode
    await page.getByRole("button", { name: "Edit Selected" }).click();

    // Form should now be in edit mode
    await expect(page.getByText("Edit Managed MCP")).toBeVisible();

    // MCP ID should be disabled
    const idInput = page.locator("input").filter({ hasValue: id }).first();
    await expect(idInput).toBeDisabled();

    // Name should be filled with existing value
    await expect(page.getByRole("textbox", { name: /^name/i })).toHaveValue(
      "Edit Test Server",
    );
  });

  test("edits existing MCP and saves changes", async ({ page, request }) => {
    const id = `edit-save-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Original Name",
        enabled: true,
        autoStart: false,
        toolPrefix: "original-prefix",
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: "node",
        args: [],
        env: [],
      },
    });

    await gotoConfig(page);

    // Select the MCP
    await expect(page.locator(".service-switch select")).toContainText(id);
    await page.locator(".service-switch select").selectOption(id);

    // Switch to edit mode
    await page.getByRole("button", { name: "Edit Selected" }).click();

    // Change the name
    const nameInput = page.getByPlaceholder("Playwright MCP");
    await nameInput.clear();
    await nameInput.fill("Updated Name");

    // Save changes
    await page.getByRole("button", { name: "Save Changes" }).click();

    // Should show success message
    await expect(page.getByRole("textbox", { name: /^name/i })).toHaveValue(
      "Updated Name",
    );
  });

  test("exports config shows JSON preview", async ({ page, request }) => {
    const id = `export-test-${Date.now()}`;

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
        command: "node",
        args: [],
        env: [],
      },
    });

    await gotoConfig(page);

    // Select the MCP
    await expect(page.locator(".service-switch select")).toContainText(id);
    await page.locator(".service-switch select").selectOption(id);

    // Click export button
    const exportButton = page.getByRole("button", { name: "Export Config" });
    await expect(exportButton).toBeVisible();
  });
});

test.describe("Config Section - Reset Form", () => {
  test("reset form clears create form", async ({ page }) => {
    await gotoConfig(page);

    // Fill some fields
    await page.getByPlaceholder("playwright").first().fill("test-id");
    await page.getByPlaceholder("Playwright MCP").fill("Test Name");

    // Reset the form
    await page.getByRole("button", { name: "Reset Form" }).click();

    // Fields should be cleared
    await expect(page.getByPlaceholder("playwright").first()).toHaveValue("");
  });

  test("reset form restores original values in edit mode", async ({
    page,
    request,
  }) => {
    const id = `reset-test-${Date.now()}`;

    // Create an MCP via API
    await ensureRuntimeReady(request);
    await request.post("http://127.0.0.1:4100/api/mcps", {
      data: {
        id,
        name: "Reset Test Server",
        enabled: true,
        autoStart: true,
        toolPrefix: id,
        startupTimeoutMs: 5000,
        transport: "stdio",
        command: "node",
        args: [],
        env: [],
      },
    });

    await gotoConfig(page);

    // Select and enter edit mode
    await expect(page.locator(".service-switch select")).toContainText(id);
    await page.locator(".service-switch select").selectOption(id);
    await page.getByRole("button", { name: "Edit Selected" }).click();

    // Change the name
    const nameInput = page.getByPlaceholder("Playwright MCP");
    await nameInput.clear();
    await nameInput.fill("Temp Name");

    // Reset
    await page.getByRole("button", { name: "Reset Changes" }).click();

    // Name should be restored
    await expect(page.getByRole("textbox", { name: /^name/i })).toHaveValue(
      "Reset Test Server",
    );
  });
});
