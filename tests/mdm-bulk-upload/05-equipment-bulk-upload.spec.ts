import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";
import { createTempCsvFile, TEMPLATE_HEADERS } from "../fixtures/bulk-upload-helpers";

test.describe("05 Equipment (IIOT_MASTER) Bulk Upload End-to-End Persistence", () => {
  test("5.1 Complete Equipment Import: Upload, Ingestion Breakdown, UI Navigation & Record Verification", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("IIOT_MASTER");

    const timestamp = Date.now().toString().slice(-5);
    const eq1Code = `EQ-TST-A-${timestamp}`;
    const eq1Name = `Precision Reactor Alpha ${timestamp}`;
    const eq2Code = `EQ-TST-B-${timestamp}`;
    const eq2Name = `Centrifuge Beta ${timestamp}`;

    const equipmentCsv = createTempCsvFile("equipment-valid-pair.csv", {
      headers: TEMPLATE_HEADERS.IIOT_MASTER,
      rows: [
        [eq1Code, eq1Name, "REACTOR", "LINE-01", "ROOM-101", "ACTIVE", true],
        [eq2Code, eq2Name, "CENTRIFUGE", "LINE-02", "ROOM-102", "MAINTENANCE", true],
      ],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(equipmentCsv);

    const submitBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await submitBtn.click();

    // Verify upload success
    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 2/i).first()).toBeVisible();

    // Ingestion breakdown table checks
    await expect(authedPage.getByText(eq1Code).first()).toBeVisible();
    await expect(authedPage.getByText(eq2Code).first()).toBeVisible();

    // Navigate to Equipment Master page to verify UI persistence
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    // Search for first equipment
    const searchInput = authedPage.getByPlaceholder(/search equipment/i);
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    await searchInput.fill(eq1Code);
    await authedPage.waitForTimeout(500);

    // Verify row appears in equipment table
    await expect(authedPage.locator("tbody").first()).toContainText(eq1Code);
    await expect(authedPage.locator("tbody").first()).toContainText(eq1Name);

    // Search for second equipment
    await searchInput.fill(eq2Code);
    await authedPage.waitForTimeout(500);
    await expect(authedPage.locator("tbody").first()).toContainText(eq2Code);
    await expect(authedPage.locator("tbody").first()).toContainText(eq2Name);
  });

  test("5.2 Equipment Update / Upsert Mode: Re-uploading with modified attributes updates records without duplicating", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("IIOT_MASTER");

    const timestamp = Date.now().toString().slice(-5);
    const eqCode = `EQ-UPS-${timestamp}`;
    const initialName = `Original Equipment ${timestamp}`;
    const updatedName = `Updated Equipment ${timestamp}`;

    // 1. Initial Upload
    const initialCsv = createTempCsvFile("eq-upsert-initial.csv", {
      headers: TEMPLATE_HEADERS.IIOT_MASTER,
      rows: [[eqCode, initialName, "AUTOCLAVE", "LINE-01", "ROOM-101", "ACTIVE", true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(initialCsv);
    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();

    // 2. Re-upload with Updated Name in UPDATE mode
    const updatedCsv = createTempCsvFile("eq-upsert-updated.csv", {
      headers: TEMPLATE_HEADERS.IIOT_MASTER,
      rows: [[eqCode, updatedName, "AUTOCLAVE", "LINE-01", "ROOM-101", "ACTIVE", true]],
    });

    await fileInput.setInputFiles(updatedCsv);
    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    // Should indicate Updated: 1, Created: 0
    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/updated: 1/i).first()).toBeVisible();

    // 3. Verify in Equipment Master table that record is updated and not duplicated
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    const searchInput = authedPage.getByPlaceholder(/search equipment/i);
    await searchInput.waitFor({ state: "visible", timeout: 15000 });
    await searchInput.fill(eqCode);
    await authedPage.waitForTimeout(500);

    const table = authedPage.locator("tbody").first();
    await expect(table).toContainText(eqCode);
    await expect(table).toContainText(updatedName);
    await expect(table).not.toContainText(initialName);
  });
});
