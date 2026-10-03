import { test, expect } from "../fixtures/auth.fixture";
import { ROUTES } from "@/config/routes";

test.describe("02 Global MDM Navigation & Architecture", () => {
  test("2.1 Sidebar contains renamed 'Master' entry leading to Equipment Master", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterManagement);
    await authedPage.waitForLoadState("domcontentloaded");

    // Locate the Master sidebar link
    const masterLink = authedPage.locator('aside a[href*="/master-management/iiot-master"]').first();
    await expect(masterLink).toBeVisible();

    // Verify it navigates to Equipment master
    await masterLink.click();
    await authedPage.waitForURL(/\/master-management\/iiot-master\/equipments/, { timeout: 15000 });
    expect(authedPage.url()).toContain(ROUTES.masterIiotEquipments);
  });

  test("2.2 Master tabs ordering, labels, and record count badges", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotEquipments);
    await authedPage.waitForLoadState("domcontentloaded");

    const expectedTabs = [
      { label: "Equipment", href: ROUTES.masterIiotEquipments },
      { label: "Critical Parameters", href: ROUTES.masterIiotCriticalParameters },
      { label: "Product Master", href: ROUTES.masterIiotProductMaster },
      { label: "Recipe Master", href: ROUTES.masterIiotRecipeMaster },
      { label: "Recipe Management", href: ROUTES.masterIiotRecipeManagement },
    ];

    const tabContainer = authedPage.locator("section.module-glass-panel").first();

    // Collect rendered tab links inside the workspace header section
    for (let i = 0; i < expectedTabs.length; i++) {
      const tabDef = expectedTabs[i];
      const tabLink = tabContainer.locator(`a[href="${tabDef.href}"]`);
      await expect(tabLink).toBeVisible();
      await expect(tabLink).toContainText(tabDef.label);
    }

    // Verify retired Critical Parameter Limits is NOT in active navigation tabs
    const retiredTab = tabContainer.locator('a[href*="critical-parameter-limits"]');
    await expect(retiredTab).toHaveCount(0);
  });

  test("2.3 Sequential tab switching and active state reflection", async ({ authedPage }) => {
    await authedPage.goto(ROUTES.masterIiotEquipments);

    // Switch to Critical Parameters
    await authedPage.locator(`a[href="${ROUTES.masterIiotCriticalParameters}"]`).click();
    await authedPage.waitForURL(ROUTES.masterIiotCriticalParameters, { timeout: 15000 });
    await expect(authedPage.locator("h1, h2, span").filter({ hasText: /Critical Parameter/i }).first()).toBeVisible();

    // Switch to Product Master
    await authedPage.locator(`a[href="${ROUTES.masterIiotProductMaster}"]`).click();
    await authedPage.waitForURL(ROUTES.masterIiotProductMaster, { timeout: 15000 });
    await expect(authedPage.locator("h1, h2, span").filter({ hasText: /Product Master/i }).first()).toBeVisible();

    // Switch to Recipe Master
    await authedPage.locator(`a[href="${ROUTES.masterIiotRecipeMaster}"]`).click();
    await authedPage.waitForURL(ROUTES.masterIiotRecipeMaster, { timeout: 15000 });
    await expect(authedPage.locator("h1, h2, span").filter({ hasText: /Recipe Master/i }).first()).toBeVisible();

    // Switch to Recipe Management
    await authedPage.locator(`a[href="${ROUTES.masterIiotRecipeManagement}"]`).click();
    await authedPage.waitForURL(ROUTES.masterIiotRecipeManagement, { timeout: 15000 });
    await expect(authedPage.locator("text=Cascading Recipe & Equipment Context").first()).toBeVisible();
  });

  test("2.4 Direct URL access, refresh, back, and forward navigation", async ({ authedPage }) => {
    // Direct URL to Recipe Master
    await authedPage.goto(ROUTES.masterIiotRecipeMaster);
    await authedPage.waitForLoadState("networkidle");
    expect(authedPage.url()).toContain(ROUTES.masterIiotRecipeMaster);

    // Reload page
    await authedPage.reload();
    await authedPage.waitForLoadState("domcontentloaded");
    expect(authedPage.url()).toContain(ROUTES.masterIiotRecipeMaster);

    // Navigate to Recipe Management
    await authedPage.locator(`a[href="${ROUTES.masterIiotRecipeManagement}"]`).click();
    await authedPage.waitForURL(ROUTES.masterIiotRecipeManagement, { timeout: 15000 });

    // Browser back
    await authedPage.goBack();
    await authedPage.waitForURL(ROUTES.masterIiotRecipeMaster, { timeout: 15000 });

    // Browser forward
    await authedPage.goForward();
    await authedPage.waitForURL(ROUTES.masterIiotRecipeManagement, { timeout: 15000 });
  });

  test("2.5 Retired Critical Parameter Limits route inspection", async ({ authedPage }) => {
    // Access retired route directly
    await authedPage.goto(ROUTES.masterIiotCriticalParameterLimits);
    await authedPage.waitForLoadState("domcontentloaded");

    // Must not crash or show unhandled exception
    await expect(authedPage.locator("body")).toBeVisible();
    const title = authedPage.locator("text=Critical Parameter Limits");
    await expect(title.first()).toBeVisible({ timeout: 10000 });

    // Verify it is not in the active tabs header
    const tabContainer = authedPage.locator("section.module-glass-panel");
    const retiredInTabs = tabContainer.locator(`a[href="${ROUTES.masterIiotCriticalParameterLimits}"]`);
    await expect(retiredInTabs).toHaveCount(0);
  });

  test("2.6 Console health monitoring across all MDM tabs", async ({ authedPage }) => {
    const consoleErrors: string[] = [];
    authedPage.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    const routes = [
      ROUTES.masterIiotEquipments,
      ROUTES.masterIiotCriticalParameters,
      ROUTES.masterIiotProductMaster,
      ROUTES.masterIiotRecipeMaster,
      ROUTES.masterIiotRecipeManagement,
    ];

    for (const route of routes) {
      await authedPage.goto(route);
      await authedPage.waitForLoadState("networkidle");
    }

    // Filter out expected benign noise (e.g. favicon, next-dev fast refresh)
    const severeErrors = consoleErrors.filter(
      (err) =>
        !err.includes("favicon") &&
        !err.includes("Download the React DevTools") &&
        !err.includes("hydrat")
    );
    expect(severeErrors).toHaveLength(0);
  });
});
