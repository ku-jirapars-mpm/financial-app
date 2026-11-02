import { expect, test } from "@playwright/test";

test("record a loan and unpaid freelance work, then get paid", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Name").fill("Owed");
  await page.getByLabel("Email").fill(`owed-${Date.now()}@example.test`);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to MyFinance" })).toBeVisible();

  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("KBank");
  await page.getByLabel("Opening balance (฿)").fill("20000");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "KBank" })).toBeVisible({ timeout: 15_000 });

  // Lend ฿5,000 from KBank: bank drops, net worth doesn't.
  await page.goto("/receivables/new");
  await page.getByRole("button", { name: "Lent money" }).click();
  await page.getByLabel("Who").fill("Somchai");
  await page.getByLabel("Amount (฿)").fill("5000");
  await page.getByRole("button", { name: "Save" }).dblclick();
  await expect(page.getByRole("heading", { name: "Somchai" })).toBeVisible({ timeout: 15_000 });
  await page.goto("/");
  await expect(page.locator("header")).toContainText("฿20,000.00"); // net worth unchanged
  await expect(page.getByRole("link", { name: /KBank Bank account/ })).toContainText("฿15,000.00");
  await expect(page.getByRole("link", { name: /Lent to Somchai/ })).toHaveCount(1); // double tap created one loan

  // Unpaid freelance work.
  await page.goto("/receivables/new");
  await page.getByLabel("Who").fill("Acme Co.");
  await page.getByLabel("Amount (฿)").fill("12000");
  await page.getByLabel("For").fill("Logo design");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Acme Co." })).toBeVisible({ timeout: 15_000 });

  await page.goto("/receivables");
  await expect(page.getByRole("link", { name: /Somchai/ })).toContainText("฿5,000.00");
  await expect(page.getByRole("link", { name: /Acme Co\./ })).toContainText("฿12,000.00");

  // Acme pays in full → income.
  await page.getByRole("link", { name: /Acme Co\./ }).click();
  await page.getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Paid in full")).toBeVisible();
  await page.goto("/");
  await expect(page.locator("section").filter({ hasText: "In" }).first()).toContainText("฿12,000.00");
});
