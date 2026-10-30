import { afterAll, beforeAll, expect, it } from "vitest";
import { createAccount, getAccount, listReconciliations, reconcileAccount } from "../../src/lib/server/accounts";
import { UserFacingError } from "../../src/lib/server/errors";
import { debtProgress, monthlyFlows, periodSummary } from "../../src/lib/server/reports";
import { createSnapshot, listSnapshots, rebuildSnapshot } from "../../src/lib/server/snapshots";
import { createTransaction, getTransaction, updateTransaction } from "../../src/lib/server/transactions";
import { as, closePool, createUser, describeDb, key } from "./helpers";

describeDb("snapshots, reconciliation and debt", () => {
  let user: string;
  let bank: string;
  let card: string;

  beforeAll(async () => {
    user = await createUser();
    const mk = (name: string, kind: "bank" | "credit_card", opening: number) =>
      as(user, (db) =>
        createAccount(db, { name, kind, institution: null, openingBalance: opening, openingBalanceDate: "2026-01-01", notes: null }),
      );
    bank = await mk("Bank", "bank", 5_000_000);
    card = await mk("Card", "credit_card", 300_000); // owes 3,000 THB
    await as(user, async (db) => {
      await createTransaction(db, {
        type: "income", accountId: bank, categoryId: null, amount: 4_000_000, date: "2026-03-25",
        description: "salary", counterparty: null, notes: null, idempotencyKey: key(),
      });
      await createTransaction(db, {
        type: "expense", accountId: card, categoryId: null, amount: 150_000, date: "2026-03-10",
        description: "dinner", counterparty: null, notes: null, idempotencyKey: key(),
      });
      await createTransaction(db, {
        type: "interest", accountId: card, categoryId: null, amount: 5_000, date: "2026-03-15",
        description: "card interest", counterparty: null, notes: null, idempotencyKey: key(),
      });
      await createTransaction(db, {
        type: "debt_payment", accountId: bank, toAccountId: card, amount: 200_000, interest: 0, fees: 0,
        date: "2026-03-28", description: "pay card", notes: null, idempotencyKey: key(),
      });
    });
  });
  afterAll(closePool);

  it("calculates debt balances and repayment from payments", async () => {
    const c = await as(user, (db) => getAccount(db, card));
    expect(c.balance_satang).toBe(-300_000 - 150_000 - 5_000 + 200_000);
    const progress = await as(user, (db) => debtProgress(db));
    const row = progress.find((p) => p.account_id === card)!;
    expect(row.starting_debt_satang).toBe(300_000);
    expect(row.current_debt_satang).toBe(255_000);
    expect(row.principal_repaid_satang).toBe(200_000);
  });

  it("rejects a debt payment into a non-liability account", async () => {
    const other = await as(user, (db) =>
      createAccount(db, { name: "Savings", kind: "bank", institution: null, openingBalance: 0, openingBalanceDate: "2026-01-01", notes: null }),
    );
    await expect(
      as(user, (db) =>
        createTransaction(db, {
          type: "debt_payment", accountId: bank, toAccountId: other, amount: 100, interest: 0, fees: 0,
          date: "2026-03-28", description: "", notes: null, idempotencyKey: key(),
        }),
      ),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("reports monthly flows from recorded transactions", async () => {
    const [jan, feb, mar] = await as(user, (db) => monthlyFlows(db, "2026-01-01", "2026-03-31"));
    expect(jan!.transaction_count).toBe(0);
    expect(feb!.month).toBe("2026-02");
    expect(mar).toMatchObject({
      month: "2026-03",
      income_satang: 4_000_000,
      expenses_satang: 155_000,
      debt_payments_satang: 200_000,
      interest_and_fees_satang: 5_000,
      net_cash_flow_satang: 4_000_000 - 200_000,
    });
    const summary = await as(user, (db) => periodSummary(db, "2026-03-01", "2026-03-31"));
    expect(summary.expenses_by_category[0]!.category).toBe("Uncategorised");
  });

  it("creates snapshots that stay unchanged when transactions are later edited", async () => {
    const id = await as(user, (db) => createSnapshot(db, "2026-03-31", "2026-03-31"));
    const [snap] = await as(user, (db) => listSnapshots(db));
    expect(snap!.id).toBe(id);
    expect(snap).toMatchObject({
      data_basis: "recorded",
      total_bank_balance_satang: 5_000_000 + 4_000_000 - 200_000,
      total_credit_card_debt_satang: 255_000,
      monthly_income_satang: 4_000_000,
      monthly_expenses_satang: 155_000,
      monthly_debt_payments_satang: 200_000,
      net_financial_position_satang: 8_800_000 - 255_000,
    });

    // Edit an ordinary transaction inside the snapshot's month.
    const { rows } = await as(user, (db) => db.query("select id from transactions where description = 'salary'"));
    const tx = await as(user, (db) => getTransaction(db, rows[0].id));
    await as(user, (db) =>
      updateTransaction(db, {
        id: tx.id, expectedVersion: tx.version, amount: 4_100_000, date: tx.transaction_date, categoryId: null,
        description: "salary", counterparty: null, notes: null, reason: "bonus included",
      }),
    );
    const [after] = await as(user, (db) => listSnapshots(db));
    expect(after!.monthly_income_satang).toBe(4_000_000);
  });

  it("never overwrites or deletes a snapshot directly", async () => {
    const [snap] = await as(user, (db) => listSnapshots(db));
    await expect(
      as(user, (db) => db.query("update financial_snapshots set monthly_income_satang = 1 where id = $1", [snap!.id])),
    ).rejects.toThrow(/permission denied|immutable/);
    await expect(as(user, (db) => db.query("delete from financial_snapshots"))).rejects.toThrow(/permission denied/);
    await expect(as(user, (db) => createSnapshot(db, "2026-03-31", "2026-03-31"))).rejects.toThrow(/already exists/);
  });

  it("rebuilds via a new superseding snapshot and keeps the original intact", async () => {
    const [old] = await as(user, (db) => listSnapshots(db));
    const newId = await as(user, (db) => rebuildSnapshot(db, old!.id, "salary corrected", "2026-04-02"));
    const all = await as(user, (db) => listSnapshots(db, { includeSuperseded: true }));
    const prev = all.find((s) => s.id === old!.id)!;
    const next = all.find((s) => s.id === newId)!;
    expect(prev.monthly_income_satang).toBe(4_000_000);
    expect(prev.superseded_by).toBe(newId);
    expect(prev.supersede_reason).toBe("salary corrected");
    expect(next.monthly_income_satang).toBe(4_100_000);
    expect(next.supersedes_id).toBe(old!.id);
    expect(next.data_basis).toBe("reconstructed_estimate");
    expect(next.metadata.warnings.length).toBeGreaterThan(0);
    await expect(as(user, (db) => rebuildSnapshot(db, old!.id, "again", "2026-04-02"))).rejects.toThrow(/current snapshot/);
    // A superseded snapshot is frozen even for the supersede columns.
    await expect(
      as(user, (db) =>
        db.query("update financial_snapshots set supersede_reason = 'x' where id = $1", [old!.id]),
      ),
    ).rejects.toThrow(/already superseded/);
  });

  it("marks back-dated snapshots as reconstructed estimates and lists excluded accounts", async () => {
    await as(user, (db) =>
      createAccount(db, { name: "New", kind: "bank", institution: null, openingBalance: 1, openingBalanceDate: "2026-06-01", notes: null }),
    );
    await as(user, (db) => createSnapshot(db, "2026-05-31", "2026-06-15"));
    const snap = (await as(user, (db) => listSnapshots(db))).find((s) => s.snapshot_date === "2026-05-31")!;
    expect(snap.data_basis).toBe("reconstructed_estimate");
    expect(snap.metadata.excluded_accounts.map((a) => a.name)).toContain("New");
  });

  it("records reconciliation events with an adjustment and reason", async () => {
    const before = await as(user, (db) => getAccount(db, bank));
    const result = await as(user, (db) =>
      reconcileAccount(db, {
        accountId: bank, asOf: "2026-04-30", statementBalance: before.balance_satang - 1_250,
        reason: "unrecorded bank fee", createAdjustment: true,
      }),
    );
    expect(result.differenceSatang).toBe(-1_250);
    expect(result.adjustmentTransactionId).not.toBeNull();
    const after = await as(user, (db) => getAccount(db, bank));
    expect(after.balance_satang).toBe(before.balance_satang - 1_250);
    const recs = await as(user, (db) => listReconciliations(db, bank));
    expect(recs[0]).toMatchObject({ difference_satang: -1_250, reason: "unrecorded bank fee" });
    await expect(
      as(user, (db) => db.query("update reconciliations set reason = 'x'")),
    ).rejects.toThrow(/permission denied/);
  });

  it("requires a reason when reconciliation finds a difference", async () => {
    await expect(
      as(user, (db) =>
        reconcileAccount(db, { accountId: bank, asOf: "2026-04-30", statementBalance: 1, reason: null, createAdjustment: true }),
      ),
    ).rejects.toBeInstanceOf(UserFacingError);
  });

  it("treats liability statement balances as amounts owed", async () => {
    const c = await as(user, (db) => getAccount(db, card));
    const r = await as(user, (db) =>
      reconcileAccount(db, { accountId: card, asOf: "2026-04-30", statementBalance: -c.balance_satang, reason: null, createAdjustment: true }),
    );
    expect(r.differenceSatang).toBe(0);
    expect(r.adjustmentTransactionId).toBeNull();
  });
});
