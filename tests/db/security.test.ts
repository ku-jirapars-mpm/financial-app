import { afterAll, beforeAll, expect, it } from "vitest";
import { APP_DB_ROLE } from "../../src/lib/db";
import { createAccount, listAccounts } from "../../src/lib/server/accounts";
import { createTransaction } from "../../src/lib/server/transactions";
import { as, closePool, createUser, describeDb, key, testPool } from "./helpers";

describeDb("account ownership and authorization (RLS)", () => {
  let alice: string;
  let bob: string;
  let aliceAccount: string;

  beforeAll(async () => {
    alice = await createUser("Alice");
    bob = await createUser("Bob");
    aliceAccount = await as(alice, (db) =>
      createAccount(db, {
        name: "Alice Bank",
        kind: "bank",
        institution: null,
        openingBalance: 100_000,
        openingBalanceDate: "2026-01-01",
        notes: null,
      }),
    );
    await as(alice, (db) =>
      createTransaction(db, {
        type: "expense",
        accountId: aliceAccount,
        categoryId: null,
        amount: 5_000,
        date: "2026-01-05",
        description: "coffee",
        counterparty: null,
        notes: null,
        idempotencyKey: key(),
      }),
    );
  });
  afterAll(closePool);

  it("hides other users' accounts, transactions and audit history", async () => {
    const counts = await as(bob, async (db) => {
      const accounts = await listAccounts(db, { includeInactive: true });
      const tx = await db.query("select * from transactions");
      const audit = await db.query("select * from audit_logs where owner_id = $1", [alice]);
      const direct = await db.query("select * from accounts where id = $1", [aliceAccount]);
      return { accounts: accounts.length, tx: tx.rowCount, audit: audit.rowCount, direct: direct.rowCount };
    });
    expect(counts).toEqual({ accounts: 0, tx: 0, audit: 0, direct: 0 });
  });

  it("prevents modifying another user's records", async () => {
    const updated = await as(bob, (db) => db.query("update accounts set name = 'pwned' where id = $1", [aliceAccount]));
    expect(updated.rowCount).toBe(0);
    const name = await as(alice, (db) => db.query("select name from accounts where id = $1", [aliceAccount]));
    expect(name.rows[0].name).toBe("Alice Bank");
  });

  it("rejects inserting rows owned by someone else", async () => {
    await expect(
      as(bob, (db) =>
        db.query(
          `insert into accounts (owner_id, name, kind, opening_balance_date) values ($1, 'x', 'cash', '2026-01-01')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("rejects referencing another user's account (no cross-owner relationships)", async () => {
    await expect(
      as(bob, (db) =>
        createTransaction(db, {
          type: "income",
          accountId: aliceAccount,
          categoryId: null,
          amount: 1,
          date: "2026-01-06",
          description: "",
          counterparty: null,
          notes: null,
          idempotencyKey: key(),
        }),
      ),
    ).rejects.toThrow();
  });

  it("returns nothing and writes nothing without an authenticated user", async () => {
    const client = await testPool().connect();
    try {
      await client.query("begin");
      await client.query(`set local role ${APP_DB_ROLE}`);
      const r = await client.query("select count(*)::int as n from accounts");
      expect(r.rows[0].n).toBe(0);
      await expect(
        client.query(`insert into accounts (name, kind, opening_balance_date) values ('x', 'cash', '2026-01-01')`),
      ).rejects.toThrow();
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("does not let the app role read auth tables or hard-delete financial records", async () => {
    await expect(as(alice, (db) => db.query(`select * from auth_sessions`))).rejects.toThrow(/permission denied/);
    await expect(as(alice, (db) => db.query("delete from transactions"))).rejects.toThrow(/permission denied/);
    await expect(as(alice, (db) => db.query("delete from accounts"))).rejects.toThrow(/permission denied/);
    await expect(as(alice, (db) => db.query("update audit_logs set reason = 'x'"))).rejects.toThrow(/permission denied/);
  });

  it("blocks hard deletes even for the table-owner role", async () => {
    const client = await testPool().connect();
    try {
      for (const [sql, msg] of [
        ["delete from transactions", /never removed/],
        ["delete from audit_logs", /append-only/],
      ] as const) {
        await client.query("begin");
        await client.query("select set_config('app.user_id', $1, true)", [alice]);
        await expect(client.query(sql)).rejects.toThrow(msg);
        await client.query("rollback");
      }
    } finally {
      client.release();
    }
  });

  it("forbids changing a record's owner", async () => {
    await expect(
      as(alice, (db) => db.query("update accounts set owner_id = $2 where id = $1", [aliceAccount, bob])),
    ).rejects.toThrow();
  });
});
