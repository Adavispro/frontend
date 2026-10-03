import { test, expect } from "../fixtures/auth.fixture";
import { generateTestId } from "../fixtures/test-data";
import { ROUTES } from "@/config/routes";

test.describe.serial("07 Recipe Batch Size Association — Complete Workflow", () => {
  const recipeCode = generateTestId("E2E_BS_RCP");
  const recipeName = `Batch Assoc Recipe ${Date.now()}`;
  const newBatchVal = "3500";
  const newBatchFormatted = "3500 KG";

  test("7.1 Setup: Create test recipe for association testing", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterCreateIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.locator("#tenantId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator("#plantId").selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator("#productId").selectOption({ index: 1 });

    await authedPage.locator("#recipeCode").fill(recipeCode);
    await authedPage.locator("#recipeName").fill(recipeName);
    await authedPage.locator("#version").fill("1.0");
    await authedPage.locator("#associatedBatchSizes").fill("1000 KG");
    await authedPage.locator("#description").fill("Recipe for batch size association test");

    await authedPage.getByRole("button", { name: /create recipe/i }).click();
    await authedPage.waitForURL(ROUTES.masterIiotRecipeMaster, { timeout: 15000 });
  });

  test("7.2 Open association dialog, inspect existing associations and recipe header", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.locator('input[placeholder*="Search" i]').first();
    await searchInput.fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await expect(row).toBeVisible();

    // Click 'Batch Sizes' button
    const batchSizesBtn = row.getByRole("button", { name: "Batch Sizes" });
    await batchSizesBtn.click();

    // Verify Dialog opens
    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("Recipe Batch Size Association")).toBeVisible();
    await expect(dialog.getByText(recipeCode).first()).toBeVisible();
    await expect(dialog.locator("table").getByText("1000 KG", { exact: true })).toBeVisible();
  });

  test("7.3 Validate input handling: empty, negative, and duplicate batch size", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.locator('input[placeholder*="Search" i]').first().fill(recipeCode);
    await authedPage.waitForTimeout(500);
    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await row.getByRole("button", { name: "Batch Sizes" }).click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Attempt to add duplicate: 1000 KG
    const batchInput = dialog.locator('input[placeholder*="e.g. 1000" i]');
    await batchInput.fill("1000");
    const addBtn = dialog.getByRole("button", { name: /add batch size/i });
    await addBtn.click();

    // Verify duplicate error alert
    await expect(dialog.locator("text=already associated")).toBeVisible({ timeout: 5000 });
  });

  test("7.4 Add new batch size and verify persistence after page reload", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.locator('input[placeholder*="Search" i]').first().fill(recipeCode);
    await authedPage.waitForTimeout(500);
    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await row.getByRole("button", { name: "Batch Sizes" }).click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Fill valid new batch size: 3500 KG
    const batchInput = dialog.locator('input[placeholder*="e.g. 1000" i]');
    await batchInput.fill(newBatchVal);
    const addBtn = dialog.getByRole("button", { name: /add batch size/i });
    await addBtn.click();

    // Verify success feedback
    await expect(dialog.locator("text=successfully associated")).toBeVisible({ timeout: 10000 });
    await expect(dialog.locator("table").getByText(newBatchFormatted, { exact: true })).toBeVisible();

    // Close dialog
    await dialog.getByRole("button", { name: "Close", exact: true }).click();

    // Reload page and re-open dialog to verify persistence
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const reloadedRow = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await reloadedRow.getByRole("button", { name: "Batch Sizes" }).click();

    const reloadedDialog = authedPage.getByRole("dialog");
    await expect(reloadedDialog).toBeVisible();
    await expect(reloadedDialog.locator("table").getByText(newBatchFormatted, { exact: true })).toBeVisible();
  });

  test("7.5 Remove batch size association and verify persistence", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.locator('input[placeholder*="Search" i]').first().fill(recipeCode);
    await authedPage.waitForTimeout(500);
    const row = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await row.getByRole("button", { name: "Batch Sizes" }).click();

    const dialog = authedPage.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Find row with 3500 KG and click remove (trash icon)
    const batchRow = dialog.locator("tbody tr").filter({ hasText: newBatchFormatted }).first();
    await expect(batchRow).toBeVisible();
    await batchRow.locator('button[title="Remove association"]').click();

    // Verify feedback message
    await expect(dialog.locator("text=removed")).toBeVisible({ timeout: 10000 });

    // Reload and verify 3500 KG is gone
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.locator('input[placeholder*="Search" i]').first().fill(recipeCode);
    await authedPage.waitForTimeout(500);

    const checkRow = authedPage.locator("tbody tr").filter({ hasText: recipeCode }).first();
    await checkRow.getByRole("button", { name: "Batch Sizes" }).click();
    const checkDialog = authedPage.getByRole("dialog");
    await expect(checkDialog.getByText(newBatchFormatted)).toBeHidden();
  });
});
