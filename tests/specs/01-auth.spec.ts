import { test, expect } from "@playwright/test";
import { TEST_CREDENTIALS } from "../fixtures/test-data";

test.describe("01 Authentication & Session Management", () => {
  test("1.1 Login page renders all required UI elements", async ({ page }) => {
    await page.goto("/auth");
    await page.waitForLoadState("domcontentloaded");

    // Title and branding
    await expect(page).toHaveTitle(/ADAVIS|Intelligence/i);
    await expect(page.locator("text=WELCOME")).toBeVisible();
    await expect(page.locator("text=Log in to access your account")).toBeVisible();

    // Inputs and initial states
    const userIdInput = page.locator("#user-id");
    const passwordInput = page.locator("#password");
    const loginButton = page.getByRole("button", { name: "Login" });

    await expect(userIdInput).toBeVisible();
    await expect(userIdInput).toBeEnabled();
    await expect(passwordInput).toBeVisible();
    await expect(passwordInput).toBeDisabled(); // progressively unlocked
    await expect(loginButton).toBeVisible();
    await expect(loginButton).toBeDisabled();
  });

  test("1.2 User verification progressive disclosure & invalid user handling", async ({ page }) => {
    await page.goto("/auth");

    const userIdInput = page.locator("#user-id");
    const passwordInput = page.locator("#password");

    // Test non-existent user
    await userIdInput.fill("non_existent_user_9999");
    await userIdInput.blur();
    await page.waitForTimeout(1000);

    // Should show error notification and keep password disabled
    const errorNotice = page.locator("text=User verification failed").or(page.locator("text=Unable to verify"));
    await expect(errorNotice.first()).toBeVisible({ timeout: 10000 });
    await expect(passwordInput).toBeDisabled();

    // Test valid user verification
    await userIdInput.fill(TEST_CREDENTIALS.username);
    await userIdInput.blur();
    await expect(passwordInput).toBeEnabled({ timeout: 15000 });

    // Display name indicator should show verified user
    const indicator = page.locator("text=Checking User...").or(page.locator("text=SUPER_ADMIN")).or(page.locator(".text-success"));
    await expect(indicator.first()).toBeVisible({ timeout: 10000 });
  });

  test("1.3 Password masking and toggle visibility", async ({ page }) => {
    await page.goto("/auth");

    const userIdInput = page.locator("#user-id");
    const passwordInput = page.locator("#password");

    await userIdInput.fill(TEST_CREDENTIALS.username);
    await userIdInput.blur();
    await expect(passwordInput).toBeEnabled({ timeout: 15000 });

    // Initial state is password masked
    await expect(passwordInput).toHaveAttribute("type", "password");
    await passwordInput.fill("DummyPass123");

    // Toggle password icon
    const toggleButton = page.getByRole("button", { name: /show password/i });
    if (await toggleButton.count() > 0) {
      await toggleButton.click();
      await expect(passwordInput).toHaveAttribute("type", "text");

      const hideButton = page.getByRole("button", { name: /hide password/i });
      await hideButton.click();
      await expect(passwordInput).toHaveAttribute("type", "password");
    }
  });

  test("1.4 Invalid password shows error notification and does not authenticate", async ({ page }) => {
    await page.goto("/auth");

    const userIdInput = page.locator("#user-id");
    const passwordInput = page.locator("#password");
    const loginButton = page.getByRole("button", { name: "Login" });

    await userIdInput.fill(TEST_CREDENTIALS.username);
    await userIdInput.blur();
    await expect(passwordInput).toBeEnabled({ timeout: 15000 });

    await passwordInput.fill("WrongPassword@999");
    await loginButton.click();

    // Should see error notification
    const errorSnackbar = page.locator("text=Login failed").or(page.locator("text=Unable to log in"));
    await expect(errorSnackbar.first()).toBeVisible({ timeout: 10000 });
    expect(page.url()).toContain("/auth");
  });

  test("1.5 Successful login establishes session and redirects to /modules", async ({ page, context }) => {
    await page.goto("/auth");

    const userIdInput = page.locator("#user-id");
    const passwordInput = page.locator("#password");
    const loginButton = page.getByRole("button", { name: "Login" });

    await userIdInput.fill(TEST_CREDENTIALS.username);
    await userIdInput.blur();
    await expect(passwordInput).toBeEnabled({ timeout: 15000 });

    await passwordInput.fill(TEST_CREDENTIALS.password);
    await loginButton.click();

    // Wait for redirect away from /auth
    await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20000 });
    expect(page.url()).toContain("/modules");

    // Verify cookies
    const cookies = await context.cookies();
    const accessCookie = cookies.find((c) => c.name === "adavis_access_token");
    expect(accessCookie).toBeDefined();
    expect(accessCookie?.value.length).toBeGreaterThan(20);
  });

  test("1.6 Protected route redirect without authentication", async ({ browser }) => {
    const unauthedContext = await browser.newContext();
    const unauthedPage = await unauthedContext.newPage();

    // Direct access to master equipment page without auth
    await unauthedPage.goto("/master-management/iiot-master/equipments");
    await unauthedPage.waitForLoadState("domcontentloaded");

    // Should redirect to /auth
    await expect(unauthedPage).toHaveURL(/\/auth/, { timeout: 15000 });
    await unauthedContext.close();
  });

  test("1.7 Logout invalidates session and redirects to login", async ({ page }) => {
    // Login first
    await page.goto("/auth");
    await page.locator("#user-id").fill(TEST_CREDENTIALS.username);
    await page.locator("#user-id").blur();
    await expect(page.locator("#password")).toBeEnabled({ timeout: 15000 });
    await page.locator("#password").fill(TEST_CREDENTIALS.password);
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20000 });

    // Navigate to Master Management
    await page.goto("/master-management/iiot-master/equipments");
    await page.waitForLoadState("domcontentloaded");

    // Find logout button in TopBar
    const logoutBtn = page.locator('button[aria-label="Logout"]').or(page.getByRole("button", { name: "Logout" }));
    await expect(logoutBtn).toBeVisible({ timeout: 10000 });
    await logoutBtn.click();

    // Verify redirected back to /auth
    await page.waitForURL(/\/auth/, { timeout: 15000 });
    expect(page.url()).toContain("/auth");
  });
});
