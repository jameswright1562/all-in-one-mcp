import { expect, test } from "./global-test";
import { configForm } from "./helpers";

test.describe("Config Section", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();
  });

  test("shows create form by default", async ({ page }) => {
    await expect(page.getByText("Add Managed MCP")).toBeVisible();
    await expect(
      page.getByText("Create a runtime target with validation."),
    ).toBeVisible();
  });

  test("validates required fields on submit", async ({ page }) => {
    // Try to submit empty form
    await page.getByRole("button", { name: "Add MCP" }).click();

    // Should show validation errors from the zod schema
    await expect(
      configForm(page).getByText(/String must contain at least 1 character/i),
    ).toBeVisible();
  });

  test("creates new stdio MCP successfully", async ({ page }) => {
    const id = `create-stdio-${Date.now()}`;

    // Fill the form
    await page.getByPlaceholder("playwright").first().fill(id);
    await page.getByPlaceholder("Playwright MCP").fill("Test Stdio Server");

    // Tool prefix should auto-fill
    const toolPrefixInput = configForm(page)
      .getByPlaceholder("playwright")
      .nth(1);
    await expect(toolPrefixInput).toHaveValue(id);

    // Fill command and args
    await page.getByPlaceholder("npx").fill("node");
    await page.getByPlaceholder("-y").fill("-e\nconsole.log('test');");

    // Submit
    await page.getByRole("button", { name: "Add MCP" }).click();

    // Should show success message
    await expect(page.getByText(/added to the fleet/)).toBeVisible({
      timeout: 5000,
    });

    // Form should be cleared (in create mode, form resets)
    const idInput = page.getByPlaceholder("playwright").first();
    await expect(idInput).toHaveValue("");
  });

  test("creates new streamable-http MCP successfully", async ({ page }) => {
    const id = `create-http-${Date.now()}`;

    // Fill the form
    await page.getByPlaceholder("playwright").first().fill(id);
    await page.getByPlaceholder("Playwright MCP").fill("Test HTTP Server");

    // Switch to streamable-http transport
    await page.getByRole("button", { name: "streamable-http" }).click();

    // Fill URL
    await page
      .getByPlaceholder("http://127.0.0.1:4100/mcp")
      .fill("http://localhost:3000/mcp");

    // Submit
    await page.getByRole("button", { name: "Add MCP" }).click();

    // Should show success message
    await expect(page.getByText(/added to the fleet/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("switches between transport types showing correct fields", async ({
    page,
  }) => {
    // Default is stdio - check stdio fields are visible
    await expect(
      configForm(page).getByText("Command", { exact: true }),
    ).toBeVisible();
    await expect(
      configForm(page).getByText("Arguments", { exact: true }),
    ).toBeVisible();
    await expect(
      configForm(page).getByText("Working Directory", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("http://127.0.0.1:4100/mcp"),
    ).not.toBeVisible();

    // Switch to streamable-http
    await page.getByRole("button", { name: "streamable-http" }).click();

    // stdio fields should be hidden, URL field should be visible
    await expect(
      configForm(page).getByText("Command", { exact: true }),
    ).not.toBeVisible();
    await expect(
      configForm(page).getByText("Service URL", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByPlaceholder("http://127.0.0.1:4100/mcp"),
    ).toBeVisible();

    // Switch back to stdio
    await page.getByRole("button", { name: "stdio" }).click();

    // stdio fields should be visible again
    await expect(
      configForm(page).getByText("Command", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Service URL")).not.toBeVisible();
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

    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    // Select the MCP from the service switcher
    await page.locator(".service-switch select").selectOption(id);

    // Switch to edit mode
    await page.getByRole("button", { name: "Edit Selected" }).click();

    // Form should now be in edit mode
    await expect(page.getByText("Edit Managed MCP")).toBeVisible();

    // MCP ID should be disabled
    const idInput = configForm(page)
      .locator("input")
      .filter({ hasValue: id })
      .first();
    await expect(idInput).toBeDisabled();

    // Name should be filled with existing value
    await expect(
      configForm(page)
        .locator("input")
        .filter({ hasValue: "Edit Test Server" })
        .first(),
    ).toBeVisible();
  });

  test("edits existing MCP and saves changes", async ({ page, request }) => {
    const id = `edit-save-${Date.now()}`;

    // Create an MCP via API
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

    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    // Select the MCP
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
    await expect(page.getByText(/updated successfully/)).toBeVisible({
      timeout: 5000,
    });
  });

  test("exports config shows JSON preview", async ({ page, request }) => {
    const id = `export-test-${Date.now()}`;

    // Create an MCP via API
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

    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    // Select the MCP
    await page.locator(".service-switch select").selectOption(id);

    // Check that the JSON preview is visible
    await expect(page.locator("pre")).toContainText(id);
    await expect(page.locator("pre")).toContainText("Export Test Server");

    // Click export button
    const exportButton = page.getByRole("button", { name: "Export Config" });
    await expect(exportButton).toBeVisible();
  });
});

test.describe("Config Section - Reset Form", () => {
  test("reset form clears create form", async ({ page }) => {
    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

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

    await page.goto("/");
    await page
      .locator(".portal-nav__item")
      .filter({ hasText: "Config" })
      .first()
      .click();

    // Select and enter edit mode
    await page.locator(".service-switch select").selectOption(id);
    await page.getByRole("button", { name: "Edit Selected" }).click();

    // Change the name
    const nameInput = page.getByPlaceholder("Playwright MCP");
    await nameInput.clear();
    await nameInput.fill("Temp Name");

    // Reset
    await page.getByRole("button", { name: "Reset Changes" }).click();

    // Name should be restored
    await expect(
      configForm(page)
        .locator("input")
        .filter({ hasValue: "Reset Test Server" })
        .first(),
    ).toBeVisible();
  });
});
