import { afterAll, beforeAll, expect, it } from "vitest";
import { balanceAsOf, createAccount, getAccount, setAccountStatus } from "../../src/lib/server/accounts";
import { ConcurrencyError } from "../../src/lib/server/errors";
import {
  createTransaction,
  getRecordHistory,
  getTransaction,
  listTransactions,
  setTransactionDeleted,
  updateTransaction,
} from "../../src/lib/server/transactions";
import { transactionFilterSchema } from "../../src/lib/validation";
import { as, closePool, createUser, describeDb, key } from "./helpers";

describeDb("financial transactions", () => {
  let user: string;
  let bank: string;
  let wallet: string;

  const newAccount = (name: string, kind: "bank" | "cash" | "credit_card", opening: number) =>
    as(user, (db) =>
      createAccount(db, {
        name,
        kind,
        institution: null,
        openingBalance: opening,
        openingBalanceDate: "2026-01-01",
        notes: null,
      }),
    );
  const expense = (accountId: string, amount: number, idempotencyKey = key(), date = "2026-02-01") =>
    as(user, (db) =>
      createTransaction(db, {
        type: "expense",
        accountId,
        categoryId: null,
        amount,
        date,
        description: "groceries",
        counterparty: null,
        notes: null,
        idempotencyKey,
      }),
    );
  const balance = (id: string) => as(user, (db) => getAccount(db, id)).then((a) => a.balance_satang);

  beforeAll(async () => {
    user = await createUser();
    bank = await newAccount("Bank", "bank", 1_000_000);
    wallet = await newAccount("Wallet", "cash", 0);
  });
  afterAll(closePool);

  it("writes both transfer legs atomically and keeps totals balanced", async () => {
    await as(user, (db) =>
      createTransaction(db, {
        type: "transfer",
        accountId: bank,
        toAccountId: wallet,
        amount: 200_000,
        date: "2026-02-02",
        description: "ATM",
        notes: null,
        idempotencyKey: key(),
      }),
    );
    expect(await balance(bank)).toBe(800_000);
    expect(await balance(wallet)).toBe(200_000);
  });

  it("rolls back every row when a multi-record operation fails part-way", async () => {
    const before = await as(user, (db) => db.query("select count(*)::int as n from transactions"));
    await expect(
      as(user, async (db) => {
        await createTransaction(db, {
          type: "transfer",
          accountId: bank,
          toAccountId: wallet,
          amount: 1_000,
          date: "2026-02-03",
          description: "",
          notes: null,
          idempotencyKey: key(),
        });
        throw new Error("simulated crash after first record");
      }),
    ).rejects.toThrow("simulated crash");
    const after = await as(user, (db) => db.query("select count(*)::int as n from transactions"));
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it("rejects an unbalanced transfer group at commit", async () => {
    await expect(
      as(user, (db) =>
        db.query(
          `insert into transactions (account_id, type, amount_satang, transaction_date, transfer_group_id)
           values ($1, 'transfer', -500, '2026-02-03', gen_random_uuid())`,
          [bank],
        ),
      ),
    ).rejects.toThrow(/transfer group/);
  });

  it("deduplicates repeated submissions with the same idempotency key", async () => {
    const k = key();
    const first = await expense(bank, 1_234, k);
    const second = await expense(bank, 1_234, k);
    expect(first.created).toBe(true);
    expect(second).toEqual({ id: first.id, created: false });
  });

  it("deduplicates concurrent duplicate submissions", async () => {
    const k = key();
    const results = await Promise.all([expense(bank, 777, k), expense(bank, 777, k), expense(bank, 777, k)]);
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    const { total } = await as(user, (db) =>
      listTransactions(db, transactionFilterSchema.parse({ accountId: bank, q: "groceries" })),
    );
    expect(total).toBeGreaterThan(0);
  });

  it("deduplicates repeated transfer submissions (no duplicate legs)", async () => {
    const k = key();
    const entry = {
      type: "transfer" as const,
      accountId: bank,
      toAccountId: wallet,
      amount: 50,
      date: "2026-02-04",
      description: "dup transfer",
      notes: null,
      idempotencyKey: k,
    };
    await Promise.all([as(user, (db) => createTransaction(db, entry)), as(user, (db) => createTransaction(db, entry))]);
    const legs = await as(user, (db) => db.query("select * from transactions where description = 'dup transfer'"));
    expect(legs.rowCount).toBe(2);
  });

  it("edits with optimistic concurrency and records an audit trail with reason", async () => {
    const { id } = await expense(bank, 10_000);
    const tx = await as(user, (db) => getTransaction(db, id));
    const edit = (amount: number) =>
      as(user, (db) =>
        updateTransaction(db, {
          id,
          expectedVersion: tx.version,
          amount,
          date: tx.transaction_date,
          categoryId: null,
          description: "groceries (corrected)",
          counterparty: null,
          notes: null,
          reason: "typo in amount",
        }),
      );
    await edit(12_000);
    // A second editor still holding the old version must not silently overwrite.
    await expect(edit(15_000)).rejects.toBeInstanceOf(ConcurrencyError);

    const updated = await as(user, (db) => getTransaction(db, id));
    expect(updated.amount_satang).toBe(-12_000);
    expect(updated.version).toBe(tx.version + 1);
    expect(updated.updated_at.getTime()).toBeGreaterThanOrEqual(updated.created_at.getTime());

    const history = await as(user, (db) => getRecordHistory(db, "transactions", id));
    expect(history.map((h) => h.action)).toEqual(["insert", "update"]);
    expect(history[1]!.reason).toBe("typo in amount");
    expect(history[1]!.old_data?.amount_satang).toBe(-10_000);
    expect(history[1]!.new_data?.amount_satang).toBe(-12_000);
    expect(history[1]!.changed_fields).toEqual(["amount_satang", "description"]);
  });

  it("serialises truly concurrent edits: exactly one wins", async () => {
    const { id } = await expense(bank, 3_000);
    const tx = await as(user, (db) => getTransaction(db, id));
    const attempt = (amount: number) =>
      as(user, (db) =>
        updateTransaction(db, {
          id,
          expectedVersion: tx.version,
          amount,
          date: tx.transaction_date,
          categoryId: null,
          description: "x",
          counterparty: null,
          notes: null,
          reason: "concurrent",
        }),
      );
    const results = await Promise.allSettled([attempt(3_100), attempt(3_200), attempt(3_300)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").every((r) => (r as PromiseRejectedResult).reason instanceof ConcurrencyError)).toBe(true);
  });

  it("edits both legs of a transfer together", async () => {
    const { id } = await as(user, (db) =>
      createTransaction(db, {
        type: "transfer",
        accountId: bank,
        toAccountId: wallet,
        amount: 1_000,
        date: "2026-02-05",
        description: "move",
        notes: null,
        idempotencyKey: key(),
      }),
    );
    const before = { bank: await balance(bank), wallet: await balance(wallet) };
    const tx = await as(user, (db) => getTransaction(db, id));
    await as(user, (db) =>
      updateTransaction(db, {
        id,
        expectedVersion: tx.version,
        amount: 1_500,
        date: "2026-02-05",
        categoryId: null,
        description: "move",
        counterparty: null,
        notes: null,
        reason: "wrong amount",
      }),
    );
    expect(await balance(bank)).toBe(before.bank - 500);
    expect(await balance(wallet)).toBe(before.wallet + 500);
  });

  it("soft-deletes with a reason, preserves the row, and can restore", async () => {
    const { id } = await expense(bank, 9_999);
    const before = await balance(bank);
    const tx = await as(user, (db) => getTransaction(db, id));
    await as(user, (db) => setTransactionDeleted(db, { id, expectedVersion: tx.version, reason: "duplicate entry" }, true));
    expect(await balance(bank)).toBe(before + 9_999);

    const deleted = await as(user, (db) => getTransaction(db, id));
    expect(deleted.deleted_reason).toBe("duplicate entry");
    const visible = await as(user, (db) => listTransactions(db, transactionFilterSchema.parse({ accountId: bank })));
    expect(visible.rows.find((r) => r.id === id)).toBeUndefined();
    const all = await as(user, (db) =>
      listTransactions(db, transactionFilterSchema.parse({ accountId: bank, includeDeleted: "1" })),
    );
    expect(all.rows.find((r) => r.id === id)).toBeDefined();

    // Deleted rows cannot be silently edited.
    await expect(
      as(user, (db) => db.query("update transactions set description = 'sneaky' where id = $1", [id])),
    ).rejects.toThrow(/restore it first/);

    await as(user, (db) => setTransactionDeleted(db, { id, expectedVersion: deleted.version, reason: "not a duplicate" }, false));
    expect(await balance(bank)).toBe(before);
  });

  it("soft-deletes both legs of a transfer together", async () => {
    const { id } = await as(user, (db) =>
      createTransaction(db, {
        type: "transfer",
        accountId: bank,
        toAccountId: wallet,
        amount: 4_000,
        date: "2026-02-06",
        description: "",
        notes: null,
        idempotencyKey: key(),
      }),
    );
    const tx = await as(user, (db) => getTransaction(db, id));
    await as(user, (db) => setTransactionDeleted(db, { id, expectedVersion: tx.version, reason: "never happened" }, true));
    const legs = await as(user, (db) =>
      db.query("select deleted_at from transactions where transfer_group_id = $1", [tx.transfer_group_id]),
    );
    expect(legs.rows.every((r) => r.deleted_at !== null)).toBe(true);
  });

  it("preserves history when an account is closed and blocks new activity", async () => {
    const acc = await newAccount("Old account", "cash", 5_000);
    await expense(acc, 1_000);
    await as(user, (db) => setAccountStatus(db, acc, "closed", "moved to another bank"));
    const closed = await as(user, (db) => getAccount(db, acc));
    expect(closed.status).toBe("closed");
    expect(closed.closed_reason).toBe("moved to another bank");
    expect(closed.balance_satang).toBe(4_000);
    const history = await as(user, (db) => listTransactions(db, transactionFilterSchema.parse({ accountId: acc })));
    expect(history.total).toBe(1);
    await expect(expense(acc, 1)).rejects.toThrow(/closed/);

    await as(user, (db) => setAccountStatus(db, acc, "active", "reopened to fix history"));
    await expect(expense(acc, 1)).resolves.toBeDefined();
  });

  it("rejects transactions dated before the account's opening balance date", async () => {
    await expect(expense(bank, 100, key(), "2025-12-31")).rejects.toThrow(/opening balance date/);
  });

  it("computes balance as of a past date", async () => {
    const acc = await newAccount("Dated", "bank", 10_000);
    await expense(acc, 1_000, key(), "2026-03-01");
    await expense(acc, 2_000, key(), "2026-04-01");
    expect(await as(user, (db) => balanceAsOf(db, acc, "2026-02-28"))).toBe(10_000);
    expect(await as(user, (db) => balanceAsOf(db, acc, "2026-03-15"))).toBe(9_000);
    expect(await as(user, (db) => balanceAsOf(db, acc, "2026-04-30"))).toBe(7_000);
  });
});
