import { expect, test } from "@playwright/test";

test("sign up, record money, review history, snapshot and back up", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.test`;
  await page.goto("/signup");
  await page.getByLabel("Name").fill("E2E");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct horse battery staple");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "Welcome to MyFinance" })).toBeVisible();

  // Account
  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill("KBank");
  await page.getByLabel("Opening balance (฿)").fill("10,000");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name: "KBank" })).toBeVisible({ timeout: 15_000 });

  // Expense with a double tap on Save must create exactly one transaction.
  await page.getByRole("link", { name: "Add transaction" }).click();
  await page.getByLabel("Amount (฿)").fill("123.45");
  await page.getByLabel("Note").fill("Lunch");
  const save = page.getByRole("button", { name: "Save" });
  await save.dblclick();
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  await expect(page.getByText("1 transactions")).toBeVisible();

  // Filter history by search text.
  await page.getByLabel("Search").fill("lunch");
  await page.getByLabel("Search").press("Enter");
  await expect(page).toHaveURL(/q=lunch/);
  await expect(page.getByRole("link", { name: /Lunch/ })).toBeVisible();

  // Edit with reason, then see it in history.
  await page.getByRole("link", { name: /Lunch/ }).click();
  await page.getByLabel("Amount (฿)").fill("150");
  await page.getByLabel("Reason for this correction").fill("receipt said 150");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/previous values are kept/)).toBeVisible();
  await page.reload();
  await expect(page.getByText("Reason: receipt said 150")).toBeVisible();

  // Balance persisted.
  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: /KBank/ })).toContainText("฿9,850.00");

  // Snapshot.
  await page.goto("/snapshots");
  await page.getByRole("button", { name: "Take snapshot" }).click();
  await expect(page.getByText("Snapshot saved.")).toBeVisible();
  await expect(page.getByText("recorded", { exact: true }).first()).toBeVisible();

  // Backup download is valid JSON with a checksum.
  const res = await page.request.get("/api/export/backup");
  expect(res.ok()).toBe(true);
  const backup = await res.json();
  expect(backup.integrity.checksum).toMatch(/^[0-9a-f]{64}$/);
  expect(backup.tables.transactions).toHaveLength(1);

  // PWA manifest for iPhone home-screen install.
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
});

test("financial pages and exports require authentication", async ({ request, page }) => {
  expect((await request.get("/api/export/backup", { maxRedirects: 0 })).status()).toBe(401);
  await page.goto("/transactions");
  await expect(page).toHaveURL(/\/login$/);
});
