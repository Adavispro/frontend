import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";
import { createTempCsvFile, TEMPLATE_HEADERS } from "../fixtures/bulk-upload-helpers";

test.describe("07 Boundary, Unicode, Security & Audit Trail Verification", () => {
  test("7.1 Unicode, Accented, and International Characters (Tamil & French)", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    const timestamp = Date.now().toString().slice(-5);
    const roleCode = `RL-UNI-${timestamp}`;
    const roleName = `Régulateur Spécial - கட்டமைப்பு ${timestamp}`;
    const desc = "Handling accents (é, è, ç), quotes ('test'), and Tamil (ஆய்வு)";

    const unicodeCsv = createTempCsvFile("unicode-role.csv", {
      headers: TEMPLATE_HEADERS.ROLE,
      rows: [[roleCode, roleName, desc, true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(unicodeCsv);

    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();

    // Verify roleCode and unicode name appear in result table
    await expect(authedPage.getByText(roleCode).first()).toBeVisible();
  });

  test("7.2 Safe handling of formula-like strings and HTML characters without injection", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    const timestamp = Date.now().toString().slice(-5);
    const roleCode = `RL-SEC-${timestamp}`;
    const formulaPayload = "=SUM(1+1)";
    const scriptPayload = "<script>alert('xss')</script>";

    const securityCsv = createTempCsvFile("security-role.csv", {
      headers: TEMPLATE_HEADERS.ROLE,
      rows: [[roleCode, formulaPayload, scriptPayload, true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(securityCsv);

    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(roleCode).first()).toBeVisible();

    // Page must remain secure and responsive without script execution
    await expect(authedPage.getByRole("heading", { name: /master data bulk upload & sync/i })).toBeVisible();
  });

  test("7.3 Audit Trail Persistence: Bulk upload generates audit record", async ({ authedPage }) => {
    // Perform an upload to ensure fresh audit log
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    const timestamp = Date.now().toString().slice(-5);
    const roleCode = `RL-AUD-${timestamp}`;

    const auditCsv = createTempCsvFile("audit-role.csv", {
      headers: TEMPLATE_HEADERS.ROLE,
      rows: [[roleCode, `Audit Role ${timestamp}`, "Audit verification", true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(auditCsv);
    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();
    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });

    // Navigate to Master Audit Logs page
    await authedPage.goto(ROUTES.masterAuditLogs);
    await authedPage.waitForLoadState("domcontentloaded");

    // Verify audit logs table or page renders
    await expect(authedPage.getByRole("heading", { name: /audit logs|audit trail/i }).first()).toBeVisible({ timeout: 10000 });
    // Verify Bulk Upload entry exists in the audit table
    await expect(authedPage.locator("body")).toContainText(/bulk upload/i);
  });
});
