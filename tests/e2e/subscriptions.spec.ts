import { expect, test } from "@playwright/test";

test("add a Netflix subscription and record its charge from Overview", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Sub");
  await page.getByLabel("Email").fill(`sub-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Welcome to MyFinance")).toBeVisible();

  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("KTC Visa");
  await page.selectOption("#kind", "credit_card");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "KTC Visa" })).toBeVisible({ timeout: 15_000 });

  await page.goto("/subscriptions/new");
  await page.getByLabel("Name").fill("Netflix");
  await page.getByLabel("Price (฿)").fill("419");
  await page.getByRole("button", { name: "Add subscription" }).click();
  await expect(page.getByRole("heading", { name: "Subscriptions" })).toBeVisible();
  await expect(page.getByText("฿419.00").first()).toBeVisible();

  // Due today → appears in Overview with a Record button; double tap records once.
  await page.goto("/");
  const upcoming = page.locator("section", { hasText: "Upcoming charges" });
  await expect(upcoming.getByText("Netflix")).toBeVisible();
  await upcoming.getByRole("button", { name: "Record" }).dblclick();
  await expect(upcoming).toHaveCount(0);

  await page.goto("/transactions");
  await expect(page.getByText("1 transactions")).toBeVisible();
  await expect(page.getByRole("link", { name: /Netflix/ })).toContainText("฿419.00");

  await page.goto("/subscriptions");
  await page.getByRole("link", { name: /Netflix/ }).click();
  await expect(page.getByRole("heading", { name: "Next charge" })).toBeVisible();
  await expect(page.locator("section", { hasText: "Payments" }).getByRole("link")).toHaveCount(1);
});
