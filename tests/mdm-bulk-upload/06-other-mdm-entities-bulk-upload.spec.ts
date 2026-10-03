import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";
import { createTempCsvFile, TEMPLATE_HEADERS } from "../fixtures/bulk-upload-helpers";

test.describe("06 Master Entities Bulk Upload & Sequence ID Generation", () => {
  test("6.1 Department Master Bulk Upload: Auto-generates DEP- sequence ID", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("DEPARTMENT");

    const timestamp = Date.now().toString().slice(-5);
    const deptCode = `DEP-Q-${timestamp}`;
    const deptName = `Quality Assurance Dept ${timestamp}`;

    const deptCsv = createTempCsvFile("department-upload.csv", {
      headers: TEMPLATE_HEADERS.DEPARTMENT,
      rows: [[deptCode, deptName, "Quality assurance division", "PLNT-0001", "", true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(deptCsv);

    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();

    // Verify assigned sequence ID pattern (DEP-xxxx)
    const assignedIdCell = authedPage.locator("table tbody tr td").nth(3);
    await expect(assignedIdCell).toContainText(/DEP-/i);
  });

  test("6.2 Role Master Bulk Upload: Auto-generates ROLE- sequence ID", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("ROLE");

    const timestamp = Date.now().toString().slice(-5);
    const roleCode = `RL-QA-${timestamp}`;
    const roleName = `Quality Lead ${timestamp}`;

    const roleCsv = createTempCsvFile("role-upload.csv", {
      headers: TEMPLATE_HEADERS.ROLE,
      rows: [[roleCode, roleName, "Oversees batch qualification", true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(roleCsv);

    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();

    // Verify assigned sequence ID pattern (ROLE-xxxx)
    const assignedIdCell = authedPage.locator("table tbody tr td").nth(3);
    await expect(assignedIdCell).toContainText(/ROLE-/i);
  });

  test("6.3 User Master Bulk Upload: Auto-generates USR- sequence ID", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("USER");

    const timestamp = Date.now().toString().slice(-5);
    const username = `qa_user_${timestamp}`;
    const email = `qa_user_${timestamp}@adavis.local`;

    const userCsv = createTempCsvFile("user-upload.csv", {
      headers: TEMPLATE_HEADERS.USER,
      rows: [[username, email, "Jane", "Doe", "DEP-0001", "Sr Analyst", "TempPass@123", "Ms", "OPERATIONAL", `EMP-${timestamp}`, true]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(userCsv);

    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();

    // Verify assigned sequence ID pattern (USR-xxxx)
    const assignedIdCell = authedPage.locator("table tbody tr td").nth(3);
    await expect(assignedIdCell).toContainText(/USR-/i);
  });

  test("6.4 Plant Master Bulk Upload: Auto-generates PLNT- sequence ID", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("PLANT");

    const timestamp = Date.now().toString().slice(-5);
    const plantCode = `PLNT-${timestamp}`;
    const plantName = `Facility Alpha ${timestamp}`;

    const plantCsv = createTempCsvFile("plant-upload.csv", {
      headers: TEMPLATE_HEADERS.PLANT,
      rows: [[plantCode, plantName, "PHARMA", true, "BLK-01", "Block 1", "AREA-01", "Area 1", "RM-101", "Room 101"]],
    });

    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(plantCsv);

    await authedPage.getByRole("button", { name: /process bulk upload/i }).click();

    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();

    // Verify assigned sequence ID pattern (PLNT-xxxx)
    const assignedIdCell = authedPage.locator("table tbody tr td").nth(3);
    await expect(assignedIdCell).toContainText(/PLNT-/i);
  });
});
