import { expect, test } from "@playwright/test";

test("credit card shows limit, used, statement day and due day", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Card");
  await page.getByLabel("Email").fill(`card-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to MyFinance" })).toBeVisible();

  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("KTC Visa");
  await page.selectOption("#kind", "credit_card");
  await page.getByLabel(/Credit limit/).fill("50,000");
  await page.getByLabel(/Statement day/).fill("25");
  await page.getByLabel(/Due day/).fill("10");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "KTC Visa" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Statement day · วันตัดบัตร").first()).toBeVisible();
  await expect(page.getByText("25th of every month")).toBeVisible();

  await page.getByRole("link", { name: "Add transaction" }).click();
  await page.getByLabel("Amount (฿)").fill("12,500");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("25% of ฿50,000.00")).toBeVisible();
  await page.getByRole("link", { name: /KTC Visa/ }).first().click();
  await expect(page.getByText("฿37,500.00")).toBeVisible(); // available
  await page.getByRole("link", { name: "Pay card" }).click();
  await expect(page.getByRole("button", { name: "Pay debt" })).toBeVisible();
});

test("rejects an invalid statement day", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Card2");
  await page.getByLabel("Email").fill(`card2-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to MyFinance" })).toBeVisible();
  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("Bad card");
  await page.selectOption("#kind", "credit_card");
  await page.getByLabel(/Credit limit/).fill("10000");
  await page.getByLabel(/Statement day/).fill("40");
  await page.getByLabel(/Due day/).fill("10");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("1–31", { exact: true })).toBeVisible();
});
