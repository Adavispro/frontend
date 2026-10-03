import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";
import { createTempCsvFile, TEMPLATE_HEADERS } from "../fixtures/bulk-upload-helpers";

test.describe("04 Row-Level Validation & Transaction Rollback", () => {
  test("4.1 All-or-nothing transaction: Mixed valid and invalid rows causes total rejection with zero persisted records", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    const validCode1 = `ROLE-TX1-${Date.now().toString().slice(-5)}`;
    const validCode2 = `ROLE-TX2-${Date.now().toString().slice(-5)}`;

    // Row 1 is valid, Row 2 is INVALID (missing roleCode), Row 3 is valid
    const mixedFile = createTempCsvFile("mixed-transaction.csv", {
      headers: TEMPLATE_HEADERS.ROLE,
      rows: [
        [validCode1, "Transaction Valid Role 1", "Desc 1", true],
        ["", "Invalid Role Blank Code", "Desc 2", true],
        [validCode2, "Transaction Valid Role 2", "Desc 3", true],
      ],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(mixedFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    // Verify rejection display
    await expect(authedPage.getByText(/upload validation results/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/validation failed for 1 records/i)).toBeVisible();

    // Verify error table shows Row 3 (header is row 1, data row 2 is CSV row 3)
    await expect(authedPage.locator("table")).toBeVisible();
    await expect(authedPage.locator("tbody")).toContainText(/roleCode/i);

    // Verify ZERO records created or updated
    await expect(authedPage.getByText(/created \(new ids\)/i).locator("..")).toContainText("0");
    await expect(authedPage.getByText(/updated/i).locator("..")).toContainText("0");
  });

  test("4.2 In-file duplicate detection: Multiple rows with duplicate business keys are rejected", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("DEPARTMENT");

    const dupCode = `DEP-DUP-${Date.now().toString().slice(-5)}`;

    // Two rows with identical departmentCode
    const dupFile = createTempCsvFile("in-file-duplicates.csv", {
      headers: TEMPLATE_HEADERS.DEPARTMENT,
      rows: [
        [dupCode, "Dept Unique Name 1", "Desc", "PLNT-0001", "", true],
        [dupCode, "Dept Unique Name 2", "Desc", "PLNT-0001", "", true],
      ],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(dupFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    // Verify rejection display
    await expect(authedPage.getByText(/upload validation results/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.locator("table")).toBeVisible();
    await expect(authedPage.locator("tbody")).toContainText(/duplicate/i);
    await expect(authedPage.locator("tbody")).toContainText(dupCode);
  });

  test("4.3 Row-level validation on first, middle, and last rows", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    // File with multiple errors across first and last rows
    const multiErrorFile = createTempCsvFile("multi-row-errors.csv", {
      headers: TEMPLATE_HEADERS.ROLE,
      rows: [
        ["", "Role With Missing Code", "Desc", true], // Error on Row 1 (CSV Row 2)
        ["ROLE-VALID-MID", "Valid Middle Role", "Desc", true],
        ["ROLE-BAD-LAST", "", "Desc", true], // Missing roleName on last row (CSV Row 4)
      ],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(multiErrorFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    await expect(authedPage.getByText(/upload validation results/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/validation failed for 2 records/i)).toBeVisible();

    // Check error details table
    const tableText = await authedPage.locator("table").innerText();
    expect(tableText).toContain("Row 2");
    expect(tableText).toContain("Row 4");
  });
});
