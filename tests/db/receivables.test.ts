import { afterAll, beforeAll, expect, it } from "vitest";
import { createAccount, getAccount } from "../../src/lib/server/accounts";
import { createBackup, restoreBackup } from "../../src/lib/server/backup";
import { UserFacingError } from "../../src/lib/server/errors";
import {
  createReceivable,
  getReceivable,
  receivableTotals,
  recordReceivablePayment,
  setReceivableWrittenOff,
  updateReceivable,
} from "../../src/lib/server/receivables";
import { monthlyFlows } from "../../src/lib/server/reports";
import { computeSnapshot } from "../../src/lib/server/snapshots";
import { as, closePool, createUser, describeDb, key } from "./helpers";

describeDb("money owed to me (receivables)", () => {
  let user: string;
  let bank: string;

  beforeAll(async () => {
    user = await createUser();
    bank = await as(user, (db) =>
      createAccount(db, { name: "Bank", kind: "bank", institution: null, openingBalance: 10_000_000, openingBalanceDate: "2026-01-01", notes: null }),
    );
  });
  afterAll(closePool);

  it("lending moves money out without changing net worth or counting as expense", async () => {
    const before = await as(user, (db) => computeSnapshot(db, "2026-03-31", "2026-03-31"));
    const { id } = await as(user, (db) =>
      createReceivable(db, {
        kind: "loan", person: "Somchai", description: "Rent help", amount: 500_000, issuedDate: "2026-03-05",
        dueDate: "2026-04-30", notes: null, fromAccountId: bank, idempotencyKey: key(),
      }),
    );
    expect((await as(user, (db) => getAccount(db, bank))).balance_satang).toBe(10_000_000 - 500_000);
    const after = await as(user, (db) => computeSnapshot(db, "2026-03-31", "2026-03-31"));
    expect(after.net_financial_position_satang).toBe(before.net_financial_position_satang);
    expect(after.monthly_expenses_satang).toBe(0);
    expect(after.net_cash_flow_satang).toBe(-500_000);

    // Partial repayment → "money returned", not income.
    await as(user, (db) =>
      recordReceivablePayment(db, { id, amount: 200_000, date: "2026-04-10", accountId: bank, categoryId: null, idempotencyKey: key() }),
    );
    const r = await as(user, (db) => getReceivable(db, id));
    expect(r).toMatchObject({ status: "partial", received_satang: 200_000, remaining_satang: 300_000 });
    const [apr] = await as(user, (db) => monthlyFlows(db, "2026-04-01", "2026-04-30"));
    expect(apr!.income_satang).toBe(0);
    await expect(
      as(user, (db) => recordReceivablePayment(db, { id, amount: 300_001, date: "2026-04-11", accountId: bank, categoryId: null, idempotencyKey: key() })),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("unpaid work is expected (not in net worth) and becomes income when paid", async () => {
    const k = key();
    const create = () =>
      as(user, (db) =>
        createReceivable(db, {
          kind: "work", person: "Acme Co.", description: "Logo design", amount: 1_500_000, issuedDate: "2026-05-01",
          dueDate: "2026-05-15", notes: null, fromAccountId: null, idempotencyKey: k,
        }),
      );
    const [a, b] = await Promise.all([create(), create()]);
    expect(a.id).toBe(b.id); // double tap → one record

    const totals = await as(user, (db) => receivableTotals(db, "2026-05-20"));
    expect(totals.workOutstandingSatang).toBe(1_500_000);
    expect(totals.lentOutstandingSatang).toBe(300_000);
    expect(totals.overdueCount).toBe(2); // work due 15 May and the loan due 30 Apr

    const payKey = key();
    await Promise.all([
      as(user, (db) => recordReceivablePayment(db, { id: a.id, amount: 1_500_000, date: "2026-05-25", accountId: bank, categoryId: null, idempotencyKey: payKey })),
      as(user, (db) => recordReceivablePayment(db, { id: a.id, amount: 1_500_000, date: "2026-05-25", accountId: bank, categoryId: null, idempotencyKey: payKey })),
    ]);
    expect((await as(user, (db) => getReceivable(db, a.id))).status).toBe("paid");
    const [may] = await as(user, (db) => monthlyFlows(db, "2026-05-01", "2026-05-31"));
    expect(may!.income_satang).toBe(1_500_000);
  });

  it("write-off removes it from net worth but keeps history; amount can't go below what's received", async () => {
    const { id } = await as(user, (db) =>
      createReceivable(db, {
        kind: "other", person: "Landlord", description: "Deposit", amount: 800_000, issuedDate: "2026-06-01",
        dueDate: null, notes: null, fromAccountId: null, idempotencyKey: key(),
      }),
    );
    const before = await as(user, (db) => receivableTotals(db, "2026-06-02"));
    await as(user, (db) => setReceivableWrittenOff(db, id, true, "landlord kept the deposit"));
    const after = await as(user, (db) => receivableTotals(db, "2026-06-02"));
    expect(after.lentOutstandingSatang).toBe(before.lentOutstandingSatang - 800_000);
    const r = await as(user, (db) => getReceivable(db, id));
    expect(r).toMatchObject({ status: "written_off", written_off_reason: "landlord kept the deposit" });
    await expect(
      as(user, (db) => recordReceivablePayment(db, { id, amount: 1, date: "2026-06-03", accountId: bank, categoryId: null, idempotencyKey: key() })),
    ).rejects.toBeInstanceOf(UserFacingError);
    await as(user, (db) => setReceivableWrittenOff(db, id, false, "got it back after all"));
    expect((await as(user, (db) => getReceivable(db, id))).status).toBe("open");

    const loan = (await as(user, (db) => db.query("select id, version from receivables where person = 'Somchai'"))).rows[0];
    await expect(
      as(user, (db) => updateReceivable(db, { id: loan.id, expectedVersion: loan.version, person: "Somchai", description: "", amount: 100_000, dueDate: null, notes: null })),
    ).rejects.toThrow(/already received/);
  });

  it("is private, can't be deleted, and survives backup/restore", async () => {
    const other = await createUser();
    expect((await as(other, (db) => db.query("select * from receivables"))).rowCount).toBe(0);
    await expect(as(user, (db) => db.query("delete from receivables"))).rejects.toThrow(/permission denied/);

    const backup = await as(user, (db) => createBackup(db, user));
    expect(backup.tables.receivables.length).toBe(3);
    const target = await createUser();
    await as(target, (db) => restoreBackup(db, backup));
    const restored = await as(target, (db) => receivableTotals(db, "2026-06-02"));
    const original = await as(user, (db) => receivableTotals(db, "2026-06-02"));
    expect(restored).toEqual(original);
  });
});
