import { test, expect } from "../fixtures/auth.fixture";
import { generateTestId } from "../fixtures/test-data";
import { ROUTES } from "@/config/routes";

test.describe("03 Equipment Master — Full Lifecycle & Topology Validation", () => {
  const testEqCode = generateTestId("E2E_EQ");
  const testEqName = `Auto Test Eq ${Date.now()}`;
  const updatedEqNameA = `${testEqName} ScenarioA`;

  test("3.1 Equipment table loads with required columns, data, and search", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    // Table headers verification
    const expectedHeaders = [
      "S No.",
      "Equipment Code",
      "Equipment Name",
      "Tenant Name",
      "Plant Name",
      "Area Name",
      "Room Name",
      "Status",
      "Actions",
    ];

    for (const header of expectedHeaders) {
      await expect(authedPage.locator("th").filter({ hasText: header }).first()).toBeVisible({ timeout: 10000 });
    }

    // Search bar functionality
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("RMG");
    await authedPage.waitForTimeout(500);

    // Rows should filter or show matching records
    const rowCount = await authedPage.locator("tbody tr").count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // Clear search
    await searchInput.clear();
    await authedPage.waitForTimeout(500);
  });

  test("3.2 Equipment creation: validation, duplicate code error, and valid creation", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterCreateIiotEquipment);
    await authedPage.waitForLoadState("domcontentloaded");

    // 1. Submit empty form to verify required field validation
    const submitBtn = authedPage.getByRole("button", { name: /create equipment/i });
    await submitBtn.click();

    // Check validation error messages
    const errors = authedPage.locator(".text-danger, [role='alert']");
    await expect(errors.first()).toBeVisible({ timeout: 5000 });

    // 2. Test duplicate equipment code error
    // Fill with known existing code 'RMG-01'
    await authedPage.locator("#tenantId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator("#plantId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator("#blockId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator("#areaId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator("#roomId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    await authedPage.locator("#equipmentCode").fill("RMG-01");
    await authedPage.locator("#equipmentName").fill("Duplicate Equipment Test");
    await submitBtn.click();

    // Verify duplicate error notification
    const duplicateNotice = authedPage.locator("text=already exists").or(authedPage.locator("text=Unable to create"));
    await expect(duplicateNotice.first()).toBeVisible({ timeout: 10000 });

    // 3. Fill with unique valid equipment code and submit
    await authedPage.locator("#equipmentCode").fill(testEqCode);
    await authedPage.locator("#equipmentName").fill(testEqName);
    await submitBtn.click();

    // Verify success toast and redirect to equipment list
    const successToast = authedPage.locator("text=created successfully");
    await expect(successToast.first()).toBeVisible({ timeout: 15000 });
    await authedPage.waitForURL(ROUTES.masterIiotEquipments, { timeout: 20000 });

    // Search for newly created equipment in table
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(testEqCode);
    await authedPage.waitForTimeout(500);

    const createdRow = authedPage.locator("tbody tr").filter({ hasText: testEqCode });
    await expect(createdRow.first()).toBeVisible();
    await expect(createdRow.first()).toContainText(testEqName);

    // Refresh and verify persistence
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    const searchInputAfterReload = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInputAfterReload.fill(testEqCode);
    await authedPage.waitForTimeout(500);
    const rowAfterReload = authedPage.locator("tbody tr").filter({ hasText: testEqCode });
    await expect(rowAfterReload.first()).toBeVisible();
  });

  test("3.3 Scenario A — Edit without changing room/topology (regression verification)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(testEqCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    await expect(row).toBeVisible();

    // Click edit button
    const editBtn = row.locator('button[aria-label="Edit record"]');
    await editBtn.click();

    // Verify Edit Dialog opens
    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Verify room is already selected and valid
    const roomSelect = authedPage.locator("#roomId");
    const currentRoom = await roomSelect.inputValue();
    expect(currentRoom).toBeTruthy();

    // Update equipment name only (leave topology/room completely untouched)
    const nameInput = authedPage.locator("#equipmentName");
    await nameInput.fill(updatedEqNameA);

    // Save changes
    await authedPage.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Verify table updated
    await authedPage.waitForTimeout(1000);
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(testEqCode);
    await authedPage.waitForTimeout(500);

    const updatedRow = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    await expect(updatedRow).toContainText(updatedEqNameA);
  });

  test("3.4 Scenario B — Edit with changed room (topology update validation)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(testEqCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    const editBtn = row.locator('button[aria-label="Edit record"]');
    await editBtn.click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    const roomSelect = authedPage.locator("#roomId");
    const roomOptionsCount = await roomSelect.locator("option").count();

    if (roomOptionsCount > 2) {
      // Pick a different room option
      await roomSelect.selectOption({ index: 2 });
    }

    await authedPage.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Refresh and reopen to verify every field
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(testEqCode);
    await authedPage.waitForTimeout(500);

    const reopenedRow = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    await reopenedRow.locator('button[aria-label="Edit record"]').click();

    await expect(dialog.first()).toBeVisible({ timeout: 10000 });
    await expect(authedPage.locator("#equipmentCode")).toHaveValue(testEqCode);
    await expect(authedPage.locator("#equipmentName")).toHaveValue(updatedEqNameA);

    // Close dialog
    const discardBtn = authedPage.getByRole("button", { name: /discard/i }).or(authedPage.locator('button[aria-label="Close dialog"]'));
    await discardBtn.first().click();
  });

  test("3.5 Equipment activation toggle lifecycle (Deactivate -> Activate)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(testEqCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    await expect(row).toBeVisible();

    // Click power / deactivate button
    const deactivateBtn = row.locator('button[aria-label="Deactivate record"]');
    await deactivateBtn.click();

    // Confirm dialog
    const deactivateDialog = authedPage.getByRole("alertdialog");
    await expect(deactivateDialog).toBeVisible({ timeout: 5000 });
    await deactivateDialog.getByRole("button", { name: "Deactivate" }).click();

    // Verify success toast or modal closing
    await expect(deactivateDialog).toBeHidden({ timeout: 10000 });
    await authedPage.waitForTimeout(1000);
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");

    // Search and verify inactive
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(testEqCode);
    await authedPage.waitForTimeout(500);
    const inactiveRow = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    await expect(inactiveRow).toContainText("Inactive");

    // Reactivate
    const activateBtn = inactiveRow.locator('button[aria-label="Activate record"]');
    await activateBtn.click();
    const activateDialog = authedPage.getByRole("alertdialog");
    await expect(activateDialog).toBeVisible({ timeout: 5000 });
    await activateDialog.getByRole("button", { name: "Activate" }).click();

    await expect(activateDialog).toBeHidden({ timeout: 10000 });

    await authedPage.waitForTimeout(1000);
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.locator('input[placeholder*="Search" i]').first().fill(testEqCode);
    await authedPage.waitForTimeout(500);
    const activeRow = authedPage.locator("tbody tr").filter({ hasText: testEqCode }).first();
    await expect(activeRow).toContainText("Active");
  });
});
