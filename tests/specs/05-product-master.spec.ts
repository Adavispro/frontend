import { test, expect } from "../fixtures/auth.fixture";
import { generateTestId } from "../fixtures/test-data";
import { ROUTES } from "@/config/routes";

test.describe.serial("05 Product Master — Full CRUD & Activation Lifecycle", () => {
  const productCode = generateTestId("E2E_PRD");
  const productName = `Auto Test Product ${Date.now()}`;
  const updatedProductName = `${productName} Updated`;

  test("5.1 Product Master table loads with required headers, data, and search", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotProductMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const expectedHeaders = [
      "S No.",
      "Product Code",
      "Product Name",
      "Tenant",
      "Plant",
      "Status",
      "Created",
      "Actions",
    ];

    for (const header of expectedHeaders) {
      await expect(authedPage.locator("th").filter({ hasText: header }).first()).toBeVisible({ timeout: 10000 });
    }

    // Search bar check
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill("PRD");
    await authedPage.waitForTimeout(500);

    const count = await authedPage.locator("tbody tr").count();
    expect(count).toBeGreaterThanOrEqual(1);

    await searchInput.clear();
    await authedPage.waitForTimeout(500);
  });

  test("5.2 Create Product Master: validation and creation", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterCreateIiotProductMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const submitBtn = authedPage.getByRole("button", { name: /create product/i });
    await submitBtn.click();

    // Check validation error
    const errors = authedPage.locator(".text-danger, [role='alert']");
    await expect(errors.first()).toBeVisible({ timeout: 5000 });

    // Select Tenant & Plant
    const tenantSelect = authedPage.locator("#tenantId");
    await tenantSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const plantSelect = authedPage.locator("#plantId");
    await plantSelect.selectOption({ index: 1 });

    // Fill valid Product details
    await authedPage.locator("#productCode").fill(productCode);
    await authedPage.locator("#productName").fill(productName);
    await submitBtn.click();

    // Verify redirect and persistence
    await authedPage.waitForURL(ROUTES.masterIiotProductMaster, { timeout: 15000 });

    // Verify record in table
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(productCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: productCode }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(productName);
  });

  test("5.3 Edit Product Master: modify fields and verify persistence", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotProductMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(productCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: productCode }).first();
    await row.locator('button[aria-label="Edit record"]').click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Update Product Name
    const nameInput = authedPage.locator("#productName");
    await nameInput.fill(updatedProductName);

    await authedPage.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Reload and verify
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(productCode);
    await authedPage.waitForTimeout(500);

    const updatedRow = authedPage.locator("tbody tr").filter({ hasText: productCode }).first();
    await expect(updatedRow).toContainText(updatedProductName);
  });

  test("5.4 Product activation toggle lifecycle (Deactivate -> Activate)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotProductMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(productCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: productCode }).first();
    await row.locator('button[aria-label="Deactivate record"]').click();

    const deactivateDialog = authedPage.getByRole("alertdialog");
    await expect(deactivateDialog).toBeVisible({ timeout: 5000 });
    await deactivateDialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(deactivateDialog).toBeHidden({ timeout: 10000 });

    // Verify Inactive in table row immediately
    const inactiveRow = authedPage.locator("tbody tr").filter({ hasText: productCode }).first();
    await expect(inactiveRow).toContainText("Inactive");

    // Reactivate
    await inactiveRow.locator('button[aria-label="Activate record"]').click();
    const activateDialog = authedPage.getByRole("alertdialog");
    await expect(activateDialog).toBeVisible({ timeout: 5000 });
    await activateDialog.getByRole("button", { name: "Activate" }).click();
    await expect(activateDialog).toBeHidden({ timeout: 10000 });

    // Verify Active in table row
    const activeRow = authedPage.locator("tbody tr").filter({ hasText: productCode }).first();
    await expect(activeRow).toContainText("Active");
  });
});
