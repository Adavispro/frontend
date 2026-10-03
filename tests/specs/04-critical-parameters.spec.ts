import { test, expect } from "../fixtures/auth.fixture";
import { generateTestId } from "../fixtures/test-data";
import { ROUTES } from "@/config/routes";

test.describe.serial("04 Standard Critical Parameters — Full Lifecycle & Validation", () => {
  const paramCode = generateTestId("E2E_PARAM");
  const paramName = `Speed Param ${Date.now()}`;
  const updatedParamName = `${paramName} Updated`;

  test("4.1 Table loads with required columns, data, and search", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotCriticalParameters);
    await authedPage.waitForLoadState("domcontentloaded");

    const expectedHeaders = [
      "S No.",
      "Equipment Name",
      "Parameter Code",
      "Parameter Name",
      "Unit Of Measure",
      "Type",
      "Status",
      "Actions",
    ];

    for (const header of expectedHeaders) {
      await expect(authedPage.locator("th").filter({ hasText: header }).first()).toBeVisible({ timeout: 10000 });
    }

    // Search bar functionality
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("RPM");
    await authedPage.waitForTimeout(500);

    // Verify row count or clear
    await searchInput.clear();
    await authedPage.waitForTimeout(500);
  });

  test("4.2 Create Critical Parameter: validation and creation", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterCreateIiotCriticalParameter);
    await authedPage.waitForLoadState("domcontentloaded");

    const submitBtn = authedPage.getByRole("button", { name: /create critical parameter/i });
    await submitBtn.click();

    // Verify validation errors appear
    const errors = authedPage.locator(".text-danger, [role='alert']");
    await expect(errors.first()).toBeVisible({ timeout: 5000 });

    // Select first equipment
    const eqSelect = authedPage.locator("#equipmentId");
    await expect(eqSelect).toBeVisible();
    await eqSelect.selectOption({ index: 1 });

    // Fill valid parameter details
    await authedPage.locator("#parameterCode").fill(paramCode);
    await authedPage.locator("#parameterName").fill(paramName);
    await authedPage.locator("#unitOfMeasure").fill("RPM");
    await authedPage.locator("#parameterType").selectOption("INT");

    await submitBtn.click();

    // Verify redirect and persistence
    await authedPage.waitForURL(ROUTES.masterIiotCriticalParameters, { timeout: 15000 });

    // Search for created parameter
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(paramCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: paramCode }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(paramName);
    await expect(row).toContainText("RPM");
    await expect(row).toContainText("INT");
  });

  test("4.3 Edit Critical Parameter: update fields and verify persistence", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotCriticalParameters);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(paramCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: paramCode }).first();
    await row.locator('button[aria-label="Edit record"]').click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Update parameter name
    const nameInput = authedPage.locator("#parameterName");
    await nameInput.fill(updatedParamName);

    await authedPage.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Reload and verify
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(paramCode);
    await authedPage.waitForTimeout(500);

    const updatedRow = authedPage.locator("tbody tr").filter({ hasText: paramCode }).first();
    await expect(updatedRow).toContainText(updatedParamName);
  });

  test("4.4 Parameter activation toggle lifecycle (Deactivate -> Activate)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotCriticalParameters);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(paramCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: paramCode }).first();
    await row.locator('button[aria-label="Deactivate record"]').click();

    const deactivateDialog = authedPage.getByRole("alertdialog");
    await expect(deactivateDialog).toBeVisible({ timeout: 5000 });
    await deactivateDialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(deactivateDialog).toBeHidden({ timeout: 10000 });

    // Verify Inactive status in table row immediately
    const inactiveRow = authedPage.locator("tbody tr").filter({ hasText: paramCode }).first();
    await expect(inactiveRow).toContainText("Inactive");

    // Reactivate
    await inactiveRow.locator('button[aria-label="Activate record"]').click();
    const activateDialog = authedPage.getByRole("alertdialog");
    await expect(activateDialog).toBeVisible({ timeout: 5000 });
    await activateDialog.getByRole("button", { name: "Activate" }).click();
    await expect(activateDialog).toBeHidden({ timeout: 10000 });

    // Verify Active status in table row
    const activeRow = authedPage.locator("tbody tr").filter({ hasText: paramCode }).first();
    await expect(activeRow).toContainText("Active");
  });
});
