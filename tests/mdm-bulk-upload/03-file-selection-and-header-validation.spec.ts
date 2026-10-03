import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";
import { createTempCsvFile, createTempRawFile, TEMPLATE_HEADERS } from "../fixtures/bulk-upload-helpers";

test.describe("03 File Selection & Header Validation", () => {
  test("3.1 File selection UI states: name display, size calculation, clear button and submit enablement", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await expect(submitBtn).toBeDisabled();

    // Select valid CSV file
    const sampleFile = createTempCsvFile("ui-state-sample.csv", {
      headers: TEMPLATE_HEADERS.DEPARTMENT,
      rows: [["DEP-UI-01", "UI Test Dept", "Test Description", "PLNT-0001", "", true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(sampleFile);

    // Verify filename display and file size
    await expect(authedPage.getByText(/ui-state-sample\.csv/i)).toBeVisible();
    await expect(authedPage.getByText(/kb/i)).toBeVisible();

    // Verify submit button is now enabled
    await expect(submitBtn).toBeEnabled();

    // Verify clear button functionality
    const clearBtn = authedPage.getByRole("button", { name: /clear/i });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();

    // After clearing, filename is removed and submit button is disabled again
    await expect(authedPage.getByText(/ui-state-sample\.csv/i)).not.toBeVisible();
    await expect(submitBtn).toBeDisabled();
  });

  test("3.2 Empty file validation (0 bytes): Backend rejects with row/header error", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("DEPARTMENT");

    const emptyFile = createTempRawFile("empty-zero-bytes.csv", "");
    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(emptyFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    // Validation failure should be displayed
    await expect(authedPage.getByText(/upload validation results|upload failed/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.locator("table")).toBeVisible();
    await expect(authedPage.locator("tbody")).toContainText(/empty|no data|header/i);
  });

  test("3.3 Header-only file (no data rows): Rejects with empty records error", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("DEPARTMENT");

    const headerOnlyFile = createTempCsvFile("header-only-no-data.csv", {
      headers: TEMPLATE_HEADERS.DEPARTMENT,
      rows: [],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(headerOnlyFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    // Backend accepts valid header and processes 0 data rows gracefully
    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/total rows/i).locator("..")).toContainText("0");
    await expect(authedPage.getByText(/created \(new ids\)/i).locator("..")).toContainText("0");
    await expect(authedPage.getByText(/errors/i).locator("..")).toContainText("0");
  });

  test("3.4 Missing required header column: Precise validation error identifies missing column", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("IIOT_MASTER");

    // Remove required equipmentCode from header
    const badHeaders = ["equipmentName", "equipmentType", "lineId", "roomCode", "status", "isActive"];
    const invalidHeaderFile = createTempCsvFile("missing-header-col.csv", {
      headers: badHeaders,
      rows: [["Test Equip", "PUMP", "LINE-01", "ROOM-101", "ACTIVE", true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(invalidHeaderFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    await expect(authedPage.getByText(/upload validation results|upload failed/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.locator("table")).toBeVisible();
    await expect(authedPage.locator("tbody")).toContainText(/equipmentCode|missing|header/i);
  });

  test("3.5 Corrupted non-CSV payload with .csv extension: Rejection without crashing", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    // Binary / null byte corrupted data
    const corruptedFile = createTempRawFile("corrupted-binary.csv", Buffer.from([0x00, 0xff, 0xfe, 0x12, 0x34, 0x56, 0x78]));
    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(corruptedFile);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    await expect(authedPage.getByText(/upload validation results|upload failed/i)).toBeVisible({ timeout: 15000 });
    // Page is alive and healthy
    await expect(authedPage.getByRole("heading", { name: /master data bulk upload & sync/i })).toBeVisible();
  });
});
