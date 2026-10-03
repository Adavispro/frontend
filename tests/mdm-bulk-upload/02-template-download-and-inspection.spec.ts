import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";
import { TEMPLATE_HEADERS, createTempCsvFile } from "../fixtures/bulk-upload-helpers";

test.describe("02 Template Download & Inspection", () => {
  const targetEntities = [
    { id: "TENANT", label: "Tenant Master", expectedHeaders: TEMPLATE_HEADERS.TENANT },
    { id: "PLANT", label: "Plant Topology", expectedHeaders: TEMPLATE_HEADERS.PLANT },
    { id: "DEPARTMENT", label: "Department Master", expectedHeaders: TEMPLATE_HEADERS.DEPARTMENT },
    { id: "ROLE", label: "Role Master", expectedHeaders: TEMPLATE_HEADERS.ROLE },
    { id: "USER", label: "User Accounts", expectedHeaders: TEMPLATE_HEADERS.USER },
    { id: "USER_GROUP", label: "User Groups", expectedHeaders: TEMPLATE_HEADERS.USER_GROUP },
    { id: "USER_GROUP_ASSIGNMENT", label: "User Group Assignments", expectedHeaders: TEMPLATE_HEADERS.USER_GROUP_ASSIGNMENT },
    { id: "IIOT_MASTER", label: "Equipment Master", expectedHeaders: TEMPLATE_HEADERS.IIOT_MASTER },
  ];

  for (const entity of targetEntities) {
    test(`2.1 Download and verify template for ${entity.id} (${entity.label})`, async ({ authedPage }) => {
      await authedPage.goto(ROUTES.masterBulkUpload);
      await authedPage.waitForLoadState("domcontentloaded");

      // Select target entity
      const entitySelect = authedPage.locator("select").first();
      await entitySelect.selectOption(entity.id);

      // Verify the download template button reflects the selected entity
      const downloadBtn = authedPage.getByRole("button", { name: new RegExp(`Download ${entity.id} Template`, "i") });
      await expect(downloadBtn).toBeVisible();

      // Trigger download
      const downloadPromise = authedPage.waitForEvent("download");
      await downloadBtn.click();
      const download = await downloadPromise;

      // Verify filename and extension
      const filename = download.suggestedFilename();
      expect(filename.toLowerCase()).toContain(entity.id.toLowerCase());
      expect(filename.toLowerCase()).toContain("template");
      expect(filename.toLowerCase().endsWith(".csv")).toBe(true);

      // Inspect file content
      const stream = await download.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      }
      const csvContent = Buffer.concat(chunks).toString("utf-8");
      const lines = csvContent.trim().split(/\r?\n/);
      expect(lines.length).toBeGreaterThanOrEqual(1);

      // Verify header matches expected business fields
      const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
      expect(headers).toEqual(entity.expectedHeaders);

      // Ensure template does NOT contain auto-generated internal database IDs
      const prohibitedIdHeaders = ["equipmentId", "departmentId", "roleId", "userId", "groupId", "plantId", "_id", "id"];
      for (const prohibited of prohibitedIdHeaders) {
        expect(headers).not.toContain(prohibited);
      }
    });
  }

  test("2.2 Round-trip validation: Generated template is directly accepted by parser", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");

    // Select IIOT_MASTER
    const entitySelect = authedPage.locator("select").first();
    await entitySelect.selectOption("IIOT_MASTER");

    // Create a valid CSV using exact template headers
    const testCode = `EQ-RT-${Date.now().toString().slice(-6)}`;
    const tempFile = createTempCsvFile("round-trip-equipment.csv", {
      headers: TEMPLATE_HEADERS.IIOT_MASTER,
      rows: [
        [testCode, `Roundtrip Equipment ${testCode}`, "OVEN", "LINE-01", "ROOM-101", "ACTIVE", true],
      ],
    });

    // Upload file
    const fileInput = authedPage.locator('input[type="file"]');
    await fileInput.setInputFiles(tempFile);

    // Verify file name display
    await expect(authedPage.getByText(/round-trip-equipment\.csv/i)).toBeVisible();

    // Click Import
    const importBtn = authedPage.getByRole("button", { name: /process bulk upload/i });
    await expect(importBtn).toBeEnabled();
    await importBtn.click();

    // Verify success banner and ingestion breakdown table
    await expect(authedPage.getByText(/upload completed successfully/i)).toBeVisible({ timeout: 15000 });
    await expect(authedPage.getByText(/created: 1/i).first()).toBeVisible();
    await expect(authedPage.getByText(testCode).first()).toBeVisible();
  });
});
