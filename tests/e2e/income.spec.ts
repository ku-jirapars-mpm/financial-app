import { expect, test } from "@playwright/test";

test("add salary as recurring income and record payday from Overview", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Inc");
  await page.getByLabel("Email").fill(`inc-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to MyFinance" })).toBeVisible();

  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("KBank");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "KBank" })).toBeVisible({ timeout: 15_000 });

  await page.goto("/income/new");
  await page.getByLabel("Name").fill("Salary");
  await page.getByLabel("Amount (฿)").fill("45000");
  await page.getByRole("button", { name: "Add income" }).click();
  await expect(page.getByRole("heading", { name: "Recurring income" })).toBeVisible();

  await page.goto("/");
  const upcoming = page.locator("section", { has: page.getByRole("heading", { name: "Upcoming" }) });
  await expect(upcoming.getByText("Salary")).toBeVisible();
  await upcoming.getByRole("button", { name: "Record" }).click();
  await expect(upcoming).toHaveCount(0);
  await expect(page.getByRole("link", { name: /KBank Bank account/ })).toContainText("฿45,000.00");
  await expect(page.locator("section").filter({ hasText: "In" }).first()).toContainText("฿45,000.00");
});
