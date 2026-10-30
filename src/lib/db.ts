import "server-only";
import { Pool, types, type PoolClient } from "pg";
import { parseSatang } from "./money";
import { withStrictSsl } from "./pg-url";

// int8 (bigint) → number with an exactness check; money is stored as integer satang.
types.setTypeParser(20, (v) => parseSatang(v));
// date → plain "YYYY-MM-DD" string; never shift calendar dates through JS Date/timezones.
types.setTypeParser(1082, (v) => v);

/** Database role every user-scoped query runs as. It has no BYPASSRLS, so RLS policies always apply. */
export const APP_DB_ROLE = "myfinance_app";

const globalForPool = globalThis as unknown as { __myfinancePool?: Pool };

export function getPool(): Pool {
  if (!globalForPool.__myfinancePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    globalForPool.__myfinancePool = new Pool({
      connectionString: withStrictSsl(connectionString),
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
    });
  }
  return globalForPool.__myfinancePool;
}

export type Db = PoolClient;

export interface UserTxOptions {
  /** Stored with audit log rows written by triggers during this transaction. */
  reason?: string | null;
}

/**
 * Runs `fn` inside one database transaction as the RLS-restricted role with
 * `app.user_id` bound to the authenticated user. Every read and write of user
 * financial data must go through here so the database, not only the app,
 * enforces ownership. All statements commit or roll back together.
 */
export async function withUserTransaction<T>(
  userId: string,
  fn: (db: Db) => Promise<T>,
  options: UserTxOptions = {},
  pool: Pool = getPool(),
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL ROLE ${APP_DB_ROLE}`);
    await client.query(
      "SELECT set_config('app.user_id', $1, true), set_config('app.change_reason', $2, true)",
      [userId, options.reason ?? ""],
    );
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** Updates the audit reason for the remaining statements of the current transaction. */
export async function setChangeReason(db: Db, reason: string | null): Promise<void> {
  await db.query("SELECT set_config('app.change_reason', $1, true)", [reason ?? ""]);
}
