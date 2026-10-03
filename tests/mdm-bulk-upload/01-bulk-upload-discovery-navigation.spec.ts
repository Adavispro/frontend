import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";

test.describe("01 MDM Bulk Upload Discovery & Navigation Architecture", () => {
  test("1.1 Access Bulk Upload via sidebar navigation and direct URL", async ({ authedPage }) => {
    // 1. Direct URL access
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    await expect(authedPage).toHaveURL(ROUTES.masterBulkUpload);
    await expect(authedPage.getByRole("heading", { name: /master data bulk upload & sync/i })).toBeVisible({ timeout: 10000 });

    // 2. Sidebar link verification
    const sidebarLink = authedPage.locator('aside a[href*="/master-management/bulk-upload"], nav a[href*="/master-management/bulk-upload"]');
    await expect(sidebarLink.first()).toBeVisible();
  });

  test("1.2 Verify page structure, headers, and automatic ID generation banner", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    // Title & description
    await expect(authedPage.getByText(/standardized csv bulk import with automatic sequence id generation/i)).toBeVisible();

    // Auto-generation notice banner
    await expect(authedPage.getByText(/automatic system id generation:/i)).toBeVisible();
    await expect(authedPage.getByText(/templates contain business fields only/i)).toBeVisible();

    // Template download action button
    const downloadTemplateBtn = authedPage.getByRole("button", { name: /download .* template/i });
    await expect(downloadTemplateBtn).toBeVisible();
  });

  test("1.3 Verify target master entity selector contains all 8 supported entities", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await expect(entitySelect).toBeVisible();

    const expectedEntities = [
      { id: "TENANT", text: /Tenant Master/i },
      { id: "PLANT", text: /Plant Topology/i },
      { id: "DEPARTMENT", text: /Department Master/i },
      { id: "ROLE", text: /Role Master/i },
      { id: "USER", text: /User Accounts/i },
      { id: "USER_GROUP", text: /User Groups/i },
      { id: "USER_GROUP_ASSIGNMENT", text: /User Group Assignments/i },
      { id: "IIOT_MASTER", text: /Equipment Master/i },
    ];

    for (const entity of expectedEntities) {
      const option = entitySelect.locator(`option[value="${entity.id}"]`);
      await expect(option).toBeAttached();
      await expect(option).toHaveText(entity.text);
    }
  });

  test("1.4 Verify upload mode choices: UPDATE (Upsert / Merge) vs TRUNCATE & LOAD", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const updateRadio = authedPage.locator('input[type="radio"][value="UPDATE"]');
    const truncateRadio = authedPage.locator('input[type="radio"][value="TRUNCATE_AND_LOAD"]');

    await expect(updateRadio).toBeVisible();
    await expect(truncateRadio).toBeVisible();

    // UPDATE is selected by default
    await expect(updateRadio).toBeChecked();
    await expect(truncateRadio).not.toBeChecked();

    // Descriptions
    await expect(authedPage.getByText(/inserts new records with auto-generated ids and updates existing/i)).toBeVisible();
    await expect(authedPage.getByText(/clears all existing tenant records in this collection and loads fresh/i)).toBeVisible();

    // Toggle to TRUNCATE_AND_LOAD
    await truncateRadio.check();
    await expect(truncateRadio).toBeChecked();
    await expect(updateRadio).not.toBeChecked();

    // Toggle back to UPDATE
    await updateRadio.check();
    await expect(updateRadio).toBeChecked();
  });

  test("1.5 Verify other MDM modules without bulk upload (Not Implemented / Not Applicable)", async ({ authedPage }) => {
    // Audit other MDM tabs to confirm absence of standalone upload/import buttons
    // 1. Critical Parameters
    await authedPage.goto(ROUTES.masterIiotCriticalParameters);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator('button:has-text("Upload"), button:has-text("Import"), a:has-text("Upload")')).toHaveCount(0);

    // 2. Product Master
    await authedPage.goto(ROUTES.masterIiotProductMaster);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator('button:has-text("Upload"), button:has-text("Import"), a:has-text("Upload")')).toHaveCount(0);

    // 3. Recipe Master
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator('button:has-text("Upload"), button:has-text("Import"), a:has-text("Upload")')).toHaveCount(0);

    // 4. Recipe Management
    await authedPage.goto(ROUTES.masterIiotRecipeManagement);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator('button:has-text("Upload"), button:has-text("Import"), a:has-text("Upload")')).toHaveCount(0);
  });
});
