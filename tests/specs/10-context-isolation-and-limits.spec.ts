import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";

test.describe.serial("10 Context Isolation & Unique Parameter Configuration", () => {
  test("10.1 Verify context isolation: different batch sizes retain independent limits", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    const productSelect = authedPage.locator('select[aria-label="Select Product"]');
    const recipeSelect = authedPage.locator('select[aria-label="Select Recipe"]');
    const batchSizeSelect = authedPage.locator('select[aria-label="Select Batch Size"]');
    const equipmentSelect = authedPage.locator('select[aria-label="Select Equipment"]');

    let foundContext = false;
    const pCount = await productSelect.locator("option").count();

    for (let p = 1; p < pCount; p++) {
      await productSelect.selectOption({ index: p });
      await authedPage.waitForTimeout(300);
      const rCount = await recipeSelect.locator("option").count();

      for (let r = 1; r < rCount; r++) {
        await recipeSelect.selectOption({ index: r });
        await authedPage.waitForTimeout(300);

        const bCount = await batchSizeSelect.locator("option").count();
        if (bCount >= 3) { // 1 empty option + at least 2 batch sizes
          const eqCount = await equipmentSelect.locator("option").count();
          for (let e = 1; e < eqCount; e++) {
            await batchSizeSelect.selectOption({ index: 1 });
            await equipmentSelect.selectOption({ index: e });
            await authedPage.waitForTimeout(300);
            const paramCount = await authedPage.locator("table tbody tr").count();
            if (paramCount > 0) {
              foundContext = true;
              break;
            }
          }
        }
        if (foundContext) break;
      }
      if (foundContext) break;
    }

    // If no recipe currently has 2 batch sizes and equipment parameters, add a batch size via Recipe Master
    if (!foundContext) {
      await authedPage.goto(ROUTES.masterIiotRecipeMaster);
      await authedPage.waitForLoadState("domcontentloaded");

      const firstRow = authedPage.locator("tbody tr").first();
      await firstRow.getByRole("button", { name: "Batch Sizes" }).click();

      const dialog = authedPage.getByRole("dialog");
      await expect(dialog).toBeVisible();

      await dialog.locator('input[placeholder*="e.g. 1000" i]').fill("5000");
      await dialog.getByRole("button", { name: /add batch size/i }).click();
      await authedPage.waitForTimeout(1000);
      await dialog.getByRole("button", { name: "Close", exact: true }).click();

      // Return to Recipe Management
      await authedPage.goto(ROUTES.masterIiotRecipeManagement);
      await authedPage.waitForLoadState("domcontentloaded");

      await productSelect.selectOption({ index: 1 });
      await authedPage.waitForTimeout(300);
      await recipeSelect.selectOption({ index: 1 });
      await authedPage.waitForTimeout(300);
    }

    // Now select Batch Size #1
    await batchSizeSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await equipmentSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const firstRow = authedPage.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10000 });

    // Fill Batch Size #1 with unique values: 111, 101, 121
    await firstRow.locator('input[placeholder="Target"]').fill("111");
    await firstRow.locator('input[placeholder="Low"]').fill("101");
    await firstRow.locator('input[placeholder="High"]').fill("121");

    await authedPage.getByRole("button", { name: /save configuration/i }).first().click();
    await expect(authedPage.locator("text=successfully").or(authedPage.locator("text=Configuration saved"))).toBeVisible({ timeout: 10000 });

    // Switch to Batch Size #2
    await batchSizeSelect.selectOption({ index: 2 });
    await authedPage.waitForTimeout(300);
    await equipmentSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    // Verify values are NOT leaked from Batch Size #1
    const newTarget = await firstRow.locator('input[placeholder="Target"]').inputValue();
    expect(newTarget).not.toBe("111");

    // Fill Batch Size #2 with different values: 222, 202, 242
    await firstRow.locator('input[placeholder="Target"]').fill("222");
    await firstRow.locator('input[placeholder="Low"]').fill("202");
    await firstRow.locator('input[placeholder="High"]').fill("242");

    await authedPage.getByRole("button", { name: /save configuration/i }).first().click();
    await expect(authedPage.locator("text=successfully").or(authedPage.locator("text=Configuration saved"))).toBeVisible({ timeout: 10000 });

    // Switch back to Batch Size #1 and verify original 111 remains intact
    await batchSizeSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);
    await equipmentSelect.selectOption({ index: 1 });
    await authedPage.waitForTimeout(300);

    const reloadedTarget = await firstRow.locator('input[placeholder="Target"]').inputValue();
    expect(reloadedTarget).toBe("111");
  });

  test("10.2 Persisted configurations view enforces context uniqueness", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    await authedPage.getByRole("button", { name: /persisted configurations/i }).click();
    await authedPage.waitForTimeout(500);

    const table = authedPage.locator("table");
    await expect(table).toBeVisible();

    // Verify both contexts (111 and 222) are persisted as distinct entries
    await expect(table).toContainText("111");
    await expect(table).toContainText("222");
  });
});
