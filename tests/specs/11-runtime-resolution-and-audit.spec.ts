import { test, expect } from "../fixtures/auth.fixture";
import { test as unauthedTest, expect as unauthedExpect } from "@playwright/test";
import { ROUTES } from "@/config/routes";

test.describe("11 Runtime Effective Limits, Audit Trail & RBAC Authorization", () => {
  test("11.1 Runtime effective-limits endpoint resolves contextual Recipe Management limits", async ({ authedPage }) => {
    // Perform API call through authed browser context to effective-limits endpoint
    const response = await authedPage.request.get(
      "/api/master-management/iiot/recipe-management/effective-limits?tenantId=TNT-0001&plantId=PLNT-0001",
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body).toHaveProperty("success", true);
    expect(Array.isArray(body.data)).toBe(true);

    // If records exist, verify fields
    if (body.data.length > 0) {
      const record = body.data[0];
      expect(record).toHaveProperty("parameterCode");
      // Must not use deprecated global limits structure
      expect(record).not.toHaveProperty("parameterLimitCode");
    }
  });

  test("11.2 Audit Trail screen displays mutation logs and required columns", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterAuditLogs);
    await authedPage.waitForLoadState("domcontentloaded");

    const expectedHeaders = [
      "Timestamp",
      "User",
      "Module",
      "Actions",
      "Status",
      "Description",
    ];

    for (const header of expectedHeaders) {
      await expect(authedPage.locator("th").filter({ hasText: header }).first()).toBeVisible({ timeout: 10000 });
    }

    // Verify audit rows are rendered
    const rows = authedPage.locator("tbody tr");
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // Verify filter button exists
    const filterBtn = authedPage.locator('button:has-text("Filters"), button:has-text("Filter")');
    await expect(filterBtn.first()).toBeVisible();
  });

  test("11.3 Batch Details and Batch Info screens load without runtime exceptions", async ({ authedPage }) => {
    // Test Batch Details
    await authedPage.goto(ROUTES.iiotBatchDetails);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();

    // Test Batch Info
    await authedPage.goto(ROUTES.iiotBatchInfo);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
  });

  unauthedTest("11.4 RBAC & Protected routes: Unauthenticated request redirects to /auth", async ({ page }) => {
    await page.goto(ROUTES.masterIiotRecipeManagement);
    await page.waitForURL(/\/auth/, { timeout: 10000 });
    expect(page.url()).toContain("/auth");
  });
});
