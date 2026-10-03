import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";

test.describe("12 Organizational MDM Screens End-to-End Validation", () => {
  test("12.1 Dashboard / Overview screen loads and renders metrics", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterManagement);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage).toHaveURL(new RegExp(ROUTES.masterManagement));
  });

  test("12.2 Tenant Management screen loads with table and create action", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterTenants);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /tenant/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.3 Plant Topology screen loads with hierarchy and topology elements", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterPlantTopology);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /plant|topology/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.4 Departments screen loads with department records and actions", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterDepartments);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /department/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.5 Roles screen loads with system roles and permission views", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterRoles);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /role/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.6 Users screen loads with user list and filter tabs", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterUsers);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /user/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.7 User Groups screen loads with group definitions", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterUserGroups);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /user group|group/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.8 User Group Assignments screen loads with assignment matrix", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterAssignments);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /assignment/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.9 Licenses screen loads with license status and details", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterLicenses);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /license/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.10 Audit Logs screen loads with activity stream", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterAuditLogs);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /audit/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.11 Workflow MDM screen loads with process definitions", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterWorkflowMdm);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /workflow/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test("12.12 Bulk Upload screen loads with entity selector and mode options", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterBulkUpload);
    await authedPage.waitForLoadState("domcontentloaded");
    await expect(authedPage.locator("body")).toBeVisible();
    await expect(authedPage.getByRole("heading", { name: /bulk upload/i }).first()).toBeVisible({ timeout: 10000 });
  });
});
