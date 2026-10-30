import type { Db } from "../db";
import { DEFAULT_CATEGORIES } from "../domain";

/** Creates the profile and default categories on first use. Idempotent. */
export async function ensureProfile(db: Db, displayName: string | null): Promise<void> {
  const { rowCount } = await db.query(
    "insert into profiles (display_name) values ($1) on conflict (id) do nothing",
    [displayName],
  );
  if (rowCount) {
    await db.query(
      `insert into categories (name, kind)
       select * from unnest($1::text[], $2::text[])
       on conflict do nothing`,
      [DEFAULT_CATEGORIES.map((c) => c.name), DEFAULT_CATEGORIES.map((c) => c.kind)],
    );
  }
}
