import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";

test.describe.serial("08 Recipe Management — Cascading Flow, Limit Validation & Persistence", () => {
  test("8.1 Cascading selection: Product -> Recipe -> Associated Batch Size -> Equipment -> Parameters", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    // Selectors
    const productSelect = authedPage.locator('select[aria-label="Select Product"]');
    const recipeSelect = authedPage.locator('select[aria-label="Select Recipe"]');
    const batchSizeSelect = authedPage.locator('select[aria-label="Select Batch Size"]');
    const equipmentSelect = authedPage.locator('select[aria-label="Select Equipment"]');

    // 1. Initial State: Downstream selectors should be disabled
    await expect(productSelect).toBeEnabled();
    await expect(recipeSelect).toBeDisabled();
    await expect(batchSizeSelect).toBeDisabled();
    await expect(equipmentSelect).toBeDisabled();

    // 2. Select Product
    await productSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await expect(recipeSelect).toBeEnabled();
    await expect(batchSizeSelect).toBeDisabled();

    // 3. Select Recipe
    await recipeSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await expect(batchSizeSelect).toBeEnabled();
    await expect(equipmentSelect).toBeDisabled();

    // 4. Select Associated Batch Size
    await batchSizeSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await expect(equipmentSelect).toBeEnabled();

    // 5. Select Equipment
    await equipmentSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(500);

    // 6. Verify Parameters Table or empty parameter state appears
    const tableHeader = authedPage.locator("table thead");
    const emptyState = authedPage.locator("text=No Critical Parameters found");
    await expect(tableHeader.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test("8.2 Downstream selections reset cleanly when upstream parent changes", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    const productSelect = authedPage.locator('select[aria-label="Select Product"]');
    const recipeSelect = authedPage.locator('select[aria-label="Select Recipe"]');
    const batchSizeSelect = authedPage.locator('select[aria-label="Select Batch Size"]');
    const equipmentSelect = authedPage.locator('select[aria-label="Select Equipment"]');

    // Select all 4
    await productSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(200);
    await recipeSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(200);
    await batchSizeSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(200);
    await equipmentSelect.selectOption({ index: 1 });

    // Now change Product to empty or different
    await productSelect.selectOption("");
    await authedPage.waitForTimeout(200);

    // Verify all downstream are reset and disabled
    await expect(recipeSelect).toBeDisabled();
    await expect(batchSizeSelect).toBeDisabled();
    await expect(equipmentSelect).toBeDisabled();
    expect(await recipeSelect.inputValue()).toBe("");
    expect(await batchSizeSelect.inputValue()).toBe("");
    expect(await equipmentSelect.inputValue()).toBe("");
  });

  test("8.3 Limit validation: Low <= Target <= High boundary enforcement", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    // Select Product, Recipe, Batch Size, Equipment that has parameters
    await authedPage.locator('select[aria-label="Select Product"]').selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator('select[aria-label="Select Recipe"]').selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator('select[aria-label="Select Batch Size"]').selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const eqSelect = authedPage.locator('select[aria-label="Select Equipment"]');
    // Try to find an equipment option with parameters
    const eqOptions = await eqSelect.locator("option").count();
    let foundParams = false;

    for (let i = 1; i < eqOptions; i++) {
      await eqSelect.selectOption({ index: i });
      await authedPage.waitForTimeout(300);
      const rowCount = await authedPage.locator("table tbody tr").count();
      if (rowCount > 0) {
        foundParams = true;
        break;
      }
    }

    if (!foundParams) {
      test.skip(true, "No equipment with critical parameters available for testing limit validation");
      return;
    }

    const firstRow = authedPage.locator("table tbody tr").first();
    const targetInput = firstRow.locator('input[placeholder="Target"]');
    const lowInput = firstRow.locator('input[placeholder="Low"]');
    const highInput = firstRow.locator('input[placeholder="High"]');

    // Case 1: Low > High (Low=120, High=100)
    await lowInput.fill("120");
    await highInput.fill("100");
    await authedPage.waitForTimeout(200);
    await expect(firstRow.locator("text=cannot exceed High limit")).toBeVisible();

    // Case 2: Target < Low (Low=100, Target=80, High=120)
    await lowInput.fill("100");
    await highInput.fill("120");
    await targetInput.fill("80");
    await authedPage.waitForTimeout(200);
    await expect(firstRow.locator("text=cannot be less than Low limit")).toBeVisible();

    // Case 3: Target > High (Low=80, Target=130, High=120)
    await lowInput.fill("80");
    await highInput.fill("120");
    await targetInput.fill("130");
    await authedPage.waitForTimeout(200);
    await expect(firstRow.locator("text=cannot exceed High limit")).toBeVisible();

    // Case 4: Boundary valid: Low=90 <= Target=100 <= High=110
    await lowInput.fill("90");
    await targetInput.fill("100");
    await highInput.fill("110");
    await authedPage.waitForTimeout(200);

    // Validation error clears
    await expect(firstRow.locator(".text-red-600")).toBeHidden();
  });

  test("8.4 Save Configuration and verify persistence across page reload", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.locator('select[aria-label="Select Product"]').selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator('select[aria-label="Select Recipe"]').selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await authedPage.locator('select[aria-label="Select Batch Size"]').selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const eqSelect = authedPage.locator('select[aria-label="Select Equipment"]');
    const eqOptions = await eqSelect.locator("option").count();
    let hasParams = false;

    for (let i = 1; i < eqOptions; i++) {
      await eqSelect.selectOption({ index: i });
      await authedPage.waitForTimeout(300);
      const rowCount = await authedPage.locator("table tbody tr").count();
      if (rowCount > 0) {
        hasParams = true;
        break;
      }
    }

    if (!hasParams) {
      test.skip(true, "No equipment with critical parameters available for save configuration");
      return;
    }

    const firstRow = authedPage.locator("table tbody tr").first();
    await firstRow.locator('input[placeholder="Low"]').fill("95");
    await firstRow.locator('input[placeholder="Target"]').fill("105");
    await firstRow.locator('input[placeholder="High"]').fill("115");

    // Click Save Configuration
    const saveBtn = authedPage.getByRole("button", { name: /save configuration/i }).first();
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // Verify success banner
    await expect(authedPage.locator("text=successfully").or(authedPage.locator("text=Configuration saved"))).toBeVisible({ timeout: 10000 });

    // Switch to 'Persisted Configurations' tab
    await authedPage.getByRole("button", { name: /persisted configurations/i }).click();
    await authedPage.waitForTimeout(500);

    // Verify persisted table contains 95, 105, 115
    const persistedTable = authedPage.locator("table");
    await expect(persistedTable).toContainText("105");
    await expect(persistedTable).toContainText("95");
    await expect(persistedTable).toContainText("115");

    // Reload page and verify still persisted
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    await authedPage.getByRole("button", { name: /persisted configurations/i }).click();
    await authedPage.waitForTimeout(500);

    const reloadedTable = authedPage.locator("table");
    await expect(reloadedTable).toContainText("105");
    await expect(reloadedTable).toContainText("95");
    await expect(reloadedTable).toContainText("115");
  });
});
