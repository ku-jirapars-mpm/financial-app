import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { describe } from "vitest";
import { withUserTransaction, type Db } from "../../src/lib/db";
import { ensureProfile } from "../../src/lib/server/profile";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const describeDb = TEST_DATABASE_URL ? describe : describe.skip;

let pool: Pool | undefined;
export function testPool(): Pool {
  pool ??= new Pool({ connectionString: TEST_DATABASE_URL, max: 10 });
  return pool;
}

export async function closePool() {
  await pool?.end();
  pool = undefined;
}

/** Creates an auth user + profile (with default categories) and returns its id. */
export async function createUser(name = "Test User"): Promise<string> {
  const id = randomUUID();
  await testPool().query(
    `insert into auth_users (id, name, email, "emailVerified") values ($1, $2, $3, false)`,
    [id, name, `${id}@example.test`],
  );
  await as(id, (db) => ensureProfile(db, name));
  return id;
}

export function as<T>(userId: string, fn: (db: Db) => Promise<T>, reason?: string): Promise<T> {
  return withUserTransaction(userId, fn, { reason }, testPool());
}

export function key(): string {
  return `test-${randomUUID()}`;
}
