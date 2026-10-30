import { afterAll, beforeAll, expect, it } from "vitest";
import { createAccount, setAccountStatus } from "../../src/lib/server/accounts";
import { backupChecksum, createBackup, restoreBackup, verifyBackup, type Backup } from "../../src/lib/server/backup";
import { createSnapshot, rebuildSnapshot, listSnapshots } from "../../src/lib/server/snapshots";
import { createTransaction, getTransaction, setTransactionDeleted } from "../../src/lib/server/transactions";
import { as, closePool, createUser, describeDb, key } from "./helpers";

describeDb("backup and restore", () => {
  let source: string;
  let backup: Backup;

  beforeAll(async () => {
    source = await createUser("Source");
    const bank = await as(source, (db) =>
      createAccount(db, { name: "Bank", kind: "bank", institution: "KBank", openingBalance: 100_000, openingBalanceDate: "2026-01-01", notes: null }),
    );
    const card = await as(source, (db) =>
      createAccount(db, { name: "Card", kind: "credit_card", institution: null, openingBalance: 50_000, openingBalanceDate: "2026-01-01", notes: null }),
    );
    const old = await as(source, (db) =>
      createAccount(db, { name: "Closed", kind: "cash", institution: null, openingBalance: 700, openingBalanceDate: "2026-01-01", notes: null }),
    );
    const { rows: cats } = await as(source, (db) => db.query("select id from categories where name = 'Groceries'"));
    await as(source, async (db) => {
      await db.query("insert into categories (name, kind) values ('Custom thing', 'expense')");
      await createTransaction(db, {
        type: "expense", accountId: bank, categoryId: cats[0].id, amount: 2_500, date: "2026-02-01",
        description: "market", counterparty: null, notes: null, idempotencyKey: key(),
      });
      await createTransaction(db, {
        type: "debt_payment", accountId: bank, toAccountId: card, amount: 10_000, interest: 500, fees: 0,
        date: "2026-02-10", description: "", notes: null, idempotencyKey: key(),
      });
    });
    const del = await as(source, (db) =>
      createTransaction(db, {
        type: "expense", accountId: bank, categoryId: null, amount: 99, date: "2026-02-11",
        description: "mistake", counterparty: null, notes: null, idempotencyKey: key(),
      }),
    );
    const t = await as(source, (db) => getTransaction(db, del.id));
    await as(source, (db) => setTransactionDeleted(db, { id: del.id, expectedVersion: t.version, reason: "entered twice" }, true));
    await as(source, (db) => setAccountStatus(db, old, "closed", "emptied"));
    const snap = await as(source, (db) => createSnapshot(db, "2026-02-28", "2026-02-28"));
    await as(source, (db) => rebuildSnapshot(db, snap, "late transaction", "2026-03-02"));
    backup = await as(source, (db) => createBackup(db, source));
  });
  afterAll(closePool);

  it("produces a backup that passes integrity checks", () => {
    expect(backup.format).toBe("myfinance-backup");
    expect(backup.integrity.row_counts.transactions).toBe(4);
    expect(backup.integrity.row_counts.financial_snapshots).toBe(2);
    expect(backup.integrity.row_counts.audit_logs).toBeGreaterThan(5);
    expect(verifyBackup(JSON.parse(JSON.stringify(backup))).ok).toBe(true);
  });

  it("detects tampering and corruption", () => {
    const tampered = structuredClone(backup);
    (tampered.tables.transactions[0] as Record<string, unknown>).amount_satang = -1;
    const r = verifyBackup(tampered);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Checksum/);

    const truncated = structuredClone(backup);
    truncated.tables.accounts.pop();
    expect(verifyBackup(truncated).ok).toBe(false);
    expect(verifyBackup({ format: "something-else" }).ok).toBe(false);
  });

  it("restores into a fresh user with identical balances, history and audit trail", async () => {
    const target = await createUser("Target");
    const result = await as(target, (db) => restoreBackup(db, backup));
    expect(result.balancesVerified).toBe(3);

    const accounts = await as(target, (db) => db.query("select id, status, closed_reason from accounts order by name"));
    expect(accounts.rows.map((a) => a.status)).toEqual(["active", "active", "closed"]);
    const restoredBalances = await as(target, (db) =>
      db.query("select a.name, b.balance_satang from accounts a join account_balances b on b.account_id = a.id order by a.name"),
    );
    const sourceBalances = await as(source, (db) =>
      db.query("select a.name, b.balance_satang from accounts a join account_balances b on b.account_id = a.id order by a.name"),
    );
    expect(restoredBalances.rows).toEqual(sourceBalances.rows);
    const deleted = await as(target, (db) => db.query("select deleted_reason from transactions where deleted_at is not null"));
    expect(deleted.rows[0].deleted_reason).toBe("entered twice");
    const snaps = await as(target, (db) => listSnapshots(db, { includeSuperseded: true }));
    expect(snaps).toHaveLength(2);
    expect(snaps.filter((s) => s.superseded_by)).toHaveLength(1);
    const audit = await as(target, (db) => db.query("select count(*)::int as n from audit_logs where reason = 'entered twice'"));
    expect(audit.rows[0].n).toBeGreaterThan(0);
    // Category references are remapped onto the target's existing default categories.
    const cat = await as(target, (db) =>
      db.query("select c.name from transactions t join categories c on c.id = t.category_id where t.description = 'market'"),
    );
    expect(cat.rows[0].name).toBe("Groceries");
    // And the source user's data is untouched and still isolated.
    const srcCount = await as(source, (db) => db.query("select count(*)::int as n from transactions"));
    expect(srcCount.rows[0].n).toBe(4);
  });

  it("refuses to restore into a profile that already has records", async () => {
    await expect(as(source, (db) => restoreBackup(db, backup))).rejects.toThrow(/empty profile/);
  });

  it("rolls back a failed restore completely", async () => {
    const target = await createUser("Partial");
    const broken = structuredClone(backup);
    broken.integrity.account_balances[Object.keys(broken.integrity.account_balances)[0]!] = 1;
    // Re-sign so it passes verification and fails only at post-restore balance checks.
    broken.integrity.checksum = backupChecksum(broken);
    await expect(as(target, (db) => restoreBackup(db, broken))).rejects.toThrow(/do not match/);
    const n = await as(target, (db) => db.query("select count(*)::int as n from transactions"));
    expect(n.rows[0].n).toBe(0);
  });
});
