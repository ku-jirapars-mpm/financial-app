import { afterAll, beforeAll, expect, it } from "vitest";
import { createAccount } from "../../src/lib/server/accounts";
import { cardStatus, saveCardDetails } from "../../src/lib/server/credit-cards";
import { UserFacingError } from "../../src/lib/server/errors";
import { createTransaction } from "../../src/lib/server/transactions";
import { as, closePool, createUser, describeDb, key } from "./helpers";

describeDb("credit card limit, statement and due dates", () => {
  let user: string;
  let card: string;
  let bank: string;
  const spend = (amount: number, date: string) =>
    as(user, (db) =>
      createTransaction(db, {
        type: "expense", accountId: card, categoryId: null, amount, date,
        description: "", counterparty: null, notes: null, idempotencyKey: key(),
      }),
    );

  beforeAll(async () => {
    user = await createUser();
    card = await as(user, (db) =>
      createAccount(db, { name: "KTC", kind: "credit_card", institution: null, openingBalance: 0, openingBalanceDate: "2026-09-01", notes: null }),
    );
    bank = await as(user, (db) =>
      createAccount(db, { name: "Bank", kind: "bank", institution: null, openingBalance: 10_000_000, openingBalanceDate: "2026-09-01", notes: null }),
    );
    await as(user, (db) => saveCardDetails(db, card, { creditLimit: 5_000_000, statementDay: 25, dueDay: 10 }));
  });
  afterAll(closePool);

  it("shows limit, used and available", async () => {
    await spend(1_000_000, "2026-10-20"); // billed on the 25 Oct statement
    await spend(200_000, "2026-10-28"); // after the statement → next bill
    const s = (await as(user, (db) => cardStatus(db, card, "2026-10-30")))!;
    expect(s).toMatchObject({
      usedSatang: 1_200_000,
      availableSatang: 3_800_000,
      lastStatement: "2026-10-25",
      nextStatement: "2026-11-25",
      dueDate: "2026-11-10",
      daysUntilDue: 11,
      nextDueDate: "2026-12-10",
      dueSatang: 1_000_000, // only what was on the statement
      minimumSatang: 100_000,
    });
  });

  it("reduces the amount due by payments made after the statement", async () => {
    await as(user, (db) =>
      createTransaction(db, {
        type: "debt_payment", accountId: bank, toAccountId: card, amount: 400_000, interest: 0, fees: 0,
        date: "2026-11-01", description: "", notes: null, idempotencyKey: key(),
      }),
    );
    const s = (await as(user, (db) => cardStatus(db, card, "2026-11-02")))!;
    expect(s.dueSatang).toBe(600_000);
    expect(s.usedSatang).toBe(800_000);
  });

  it("updates terms and rejects card details on non-card accounts", async () => {
    await as(user, (db) => saveCardDetails(db, card, { creditLimit: 8_000_000, statementDay: 5, dueDay: 25 }));
    const s = (await as(user, (db) => cardStatus(db, card, "2026-11-02")))!;
    expect(s.details.credit_limit_satang).toBe(8_000_000);
    expect(s.dueDate).toBe("2026-10-25");
    await expect(as(user, (db) => saveCardDetails(db, bank, { creditLimit: 1, statementDay: 1, dueDay: 2 }))).rejects.toBeInstanceOf(UserFacingError);
  });
});
