import { test as base, expect, Page } from "@playwright/test";
import { TEST_CREDENTIALS } from "./test-data";

export async function loginViaUI(page: Page, username = TEST_CREDENTIALS.username, password = TEST_CREDENTIALS.password) {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");

  const userIdInput = page.locator("#user-id");
  await expect(userIdInput).toBeVisible({ timeout: 15000 });
  await userIdInput.fill(username);
  await userIdInput.blur();

  // Wait for identity verification indicator or password field enablement
  const passwordInput = page.locator("#password");
  await expect(passwordInput).toBeEnabled({ timeout: 15000 });
  await passwordInput.fill(password);

  const loginButton = page.getByRole("button", { name: "Login" });
  await expect(loginButton).toBeEnabled();
  await loginButton.click();

  // Wait for redirect to modules or main page
  await page.waitForURL((url) => !url.pathname.includes("/auth"), { timeout: 20000 });
  await page.waitForLoadState("domcontentloaded");
}

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await loginViaUI(page);
    await use(page);
  },
});

export { expect };
