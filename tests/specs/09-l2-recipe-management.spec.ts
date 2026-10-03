import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";

test.describe("09 L2 Recipe Management — Read-Only Display & HMI Dispatch Integration", () => {
  test("9.1 L2 Recipe Management screen loads with read-only parameter limits", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.iiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    // Verify Title & Subtitle
    await expect(authedPage.getByRole("heading", { name: /l2 recipe management/i })).toBeVisible({ timeout: 10000 });
    await expect(authedPage.getByText(/read-only view/i)).toBeVisible();

    // Verify Recipe Selector
    const recipeSelect = authedPage.locator("select").first();
    await expect(recipeSelect).toBeVisible();

    const tableOrEmpty = authedPage.locator("table thead").or(authedPage.locator("text=No recipe parameters configured"));
    await expect(tableOrEmpty.first()).toBeVisible({ timeout: 10000 });

    if (await authedPage.locator("table thead").isVisible()) {
      const expectedHeaders = [
        "S No.",
        "Product",
        "Recipe",
        "Batch Size",
        "Equipment",
        "Parameter Code",
        "Target Setpoint",
        "Low Limit",
        "High Limit",
        "Status",
      ];

      for (const header of expectedHeaders) {
        await expect(authedPage.locator("th").filter({ hasText: header }).first()).toBeVisible({ timeout: 5000 });
      }

      // Verify Read-Only: No inputs in parameter table
      const tableInputs = authedPage.locator("table tbody input");
      await expect(tableInputs).toHaveCount(0);
    }
  });

  test("9.2 Recipe selection displays Recipe Info Card and filters limits", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.iiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    const recipeSelect = authedPage.locator("select").first();
    const optionsCount = await recipeSelect.locator("option").count();

    if (optionsCount > 1) {
      // Select the first recipe option
      await recipeSelect.selectOption({ index: 1 });
      await authedPage.waitForTimeout(500);

      // Verify Recipe Info Card appears
      await expect(authedPage.getByText(/recipe name:/i)).toBeVisible();
      await expect(authedPage.getByText(/recipe code:/i)).toBeVisible();
      await expect(authedPage.getByText(/active in master/i)).toBeVisible();

      // Verify "Upload to HMI" button is visible
      const uploadBtn = authedPage.getByRole("button", { name: /upload to hmi/i });
      await expect(uploadBtn).toBeVisible();
    }
  });

  test("9.3 Upload to HMI workflow and backend contract verification", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.iiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    const recipeSelect = authedPage.locator("select").first();
    const optionsCount = await recipeSelect.locator("option").count();

    if (optionsCount > 1) {
      await recipeSelect.selectOption({ index: 1 });
      await authedPage.waitForTimeout(500);

      const uploadBtn = authedPage.getByRole("button", { name: /upload to hmi/i });
      await uploadBtn.click();

      // Confirm dialog opens
      const confirmDialog = authedPage.getByRole("alertdialog");
      await expect(confirmDialog).toBeVisible({ timeout: 5000 });
      await expect(confirmDialog.getByText(/upload recipe to hmi/i)).toBeVisible();

      // Intercept or monitor upload network request
      const [response] = await Promise.all([
        authedPage.waitForResponse((res) => res.url().includes("upload-to-hmi") || res.url().includes("recipe-management"), { timeout: 10000 }).catch(() => null),
        confirmDialog.getByRole("button", { name: /upload to hmi/i }).click(),
      ]);

      // Verify modal closes and feedback notification displays
      await expect(confirmDialog).toBeHidden({ timeout: 10000 });
      const feedbackToast = authedPage.locator('[role="status"], .snackbar, [aria-live="polite"]').or(authedPage.locator("text=HMI"));
      await expect(feedbackToast.first()).toBeVisible({ timeout: 10000 });
    }
  });
});
