import { test, expect } from "@playwright/test";

test("smoke test - loads login page", async ({ page }) => {
  await page.goto("/auth");
  await expect(page).toHaveTitle(/ADAVIS|Intelligence/i);
  await expect(page.locator("#user-id")).toBeVisible();
});
