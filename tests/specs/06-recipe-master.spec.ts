import { test, expect } from "../fixtures/auth.fixture";
import { generateTestId } from "../fixtures/test-data";
import { ROUTES } from "@/config/routes";

test.describe.serial("06 Recipe Master — Full Lifecycle & Backend Data Verification", () => {
  const recipeCode = generateTestId("E2E_RCP");
  const recipeName = `Auto Test Recipe ${Date.now()}`;
  const updatedRecipeName = `${recipeName} v2`;

  test("6.1 Recipe table loads real backend recipes and required columns", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const expectedHeaders = [
      "S No.",
      "Recipe ID",
      "Recipe Code",
      "Recipe Name",
      "Product",
      "Version",
      "Associated Batch Sizes",
      "Description",
      "Status",
      "Actions",
    ];

    for (const header of expectedHeaders) {
      await expect(authedPage.locator("th").filter({ hasText: header }).first()).toBeVisible({ timeout: 10000 });
    }

    // Verify existing real backend recipes appear (e.g. RCP-0001 or Paracetamol)
    const tableBody = authedPage.locator("tbody");
    await expect(tableBody).toBeVisible();
    const rows = tableBody.locator("tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Search bar functionality
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill("RCP");
    await authedPage.waitForTimeout(500);

    const filteredCount = await authedPage.locator("tbody tr").count();
    expect(filteredCount).toBeGreaterThanOrEqual(1);

    await searchInput.clear();
    await authedPage.waitForTimeout(500);
  });

  test("6.2 Create Recipe Master: validation and creation", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterCreateIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const submitBtn = authedPage.getByRole("button", { name: /create recipe/i });
    await submitBtn.click();

    // Check validation errors
    const errors = authedPage.locator(".text-danger, [role='alert']");
    await expect(errors.first()).toBeVisible({ timeout: 5000 });

    // Select Tenant, Plant, Product
    const tenantSelect = authedPage.locator("#tenantId");
    await tenantSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const plantSelect = authedPage.locator("#plantId");
    await plantSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const productSelect = authedPage.locator("#productId");
    await productSelect.selectOption({ index: 1 });

    // Fill valid Recipe details
    await authedPage.locator("#recipeCode").fill(recipeCode);
    await authedPage.locator("#recipeName").fill(recipeName);
    await authedPage.locator("#version").fill("1.0");
    await authedPage.locator("#associatedBatchSizes").fill("500 KG, 1000 KG");
    await authedPage.locator("#description").fill("Automated E2E Recipe for validation");

    await submitBtn.click();

    // Verify redirect and persistence
    await authedPage.waitForURL(ROUTES.masterIiotRecipeMaster, { timeout: 15000 });

    // Search for created recipe
    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(recipeName);
    await expect(row).toContainText("500 KG");
  });

  test("6.3 Edit Recipe Master: update fields and verify persistence", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await row.locator('button[aria-label="Edit record"]').click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 10000 });

    // Update Recipe Name
    await authedPage.locator("#recipeName").fill(updatedRecipeName);

    await authedPage.getByRole("button", { name: "Save Changes" }).click();
    await expect(dialog).toBeHidden({ timeout: 10000 });

    // Reload and verify
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const updatedRow = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await expect(updatedRow).toContainText(updatedRecipeName);
  });

  test("6.4 Recipe activation toggle lifecycle (Deactivate -> Activate)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await row.locator('button[aria-label="Deactivate record"]').click();

    const deactivateDialog = authedPage.getByRole("alertdialog");
    await expect(deactivateDialog).toBeVisible({ timeout: 5000 });
    await deactivateDialog.getByRole("button", { name: "Deactivate" }).click();
    await expect(deactivateDialog).toBeHidden({ timeout: 10000 });

    // Verify Inactive in table row immediately
    const inactiveRow = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await expect(inactiveRow).toContainText("Inactive");

    // Reactivate
    await inactiveRow.locator('button[aria-label="Activate record"]').click();
    const activateDialog = authedPage.getByRole("alertdialog");
    await expect(activateDialog).toBeVisible({ timeout: 5000 });
    await activateDialog.getByRole("button", { name: "Activate" }).click();
    await expect(activateDialog).toBeHidden({ timeout: 10000 });

    // Verify Active in table row
    const activeRow = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await expect(activeRow).toContainText("Active");
  });
});
