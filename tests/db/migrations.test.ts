import { cpSync, mkdtempSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATIONS_DIR, migrate } from "../../scripts/migrate";
import { describeDb, TEST_DATABASE_URL } from "./helpers";

// Uses a separate scratch database so it can be reset freely.
const SCRATCH_URL = process.env.TEST_SCRATCH_DATABASE_URL;
const d = SCRATCH_URL ? describeDb : describeDb.skip;

d("database migration safety", () => {
  let dir: string;
  const quiet = { log: () => undefined };

  async function reset() {
    const c = new Client({ connectionString: SCRATCH_URL });
    await c.connect();
    await c.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
    await c.end();
  }

  beforeAll(async () => {
    await reset();
    dir = mkdtempSync(join(tmpdir(), "migrations-"));
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("applies all migrations to an empty database and is idempotent", async () => {
    const first = await migrate(SCRATCH_URL!, { dir, ...quiet });
    expect(first.length).toBeGreaterThanOrEqual(4);
    expect(await migrate(SCRATCH_URL!, { dir, ...quiet })).toEqual([]);
  });

  it("refuses to run when an applied migration was edited", async () => {
    appendFileSync(join(dir, "0002_core_schema.sql"), "\n-- edited\n");
    await expect(migrate(SCRATCH_URL!, { dir, ...quiet })).rejects.toThrow(/modified after being applied/);
  });

  it("rolls back a failing migration and records nothing", async () => {
    cpSync(MIGRATIONS_DIR, dir, { recursive: true });
    writeFileSync(join(dir, "9999_broken.sql"), "create table should_not_exist (id int); select 1/0;");
    await expect(migrate(SCRATCH_URL!, { dir, ...quiet })).rejects.toThrow(/rolled back/);
    const c = new Client({ connectionString: SCRATCH_URL });
    await c.connect();
    const t = await c.query("select to_regclass('should_not_exist') as t");
    const m = await c.query("select count(*)::int as n from schema_migrations where name = '9999_broken.sql'");
    await c.end();
    expect(t.rows[0].t).toBeNull();
    expect(m.rows[0].n).toBe(0);
    rmSync(join(dir, "9999_broken.sql"));
  });

  it("enables row level security on every user-owned table", async () => {
    const c = new Client({ connectionString: TEST_DATABASE_URL });
    await c.connect();
    const { rows } = await c.query(`
      select c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
        and exists (select 1 from information_schema.columns col
                    where col.table_name = c.relname and col.column_name = 'owner_id')`);
    await c.end();
    expect(rows.length).toBeGreaterThanOrEqual(14);
    for (const r of rows) expect([r.relname, r.relrowsecurity, r.relforcerowsecurity]).toEqual([r.relname, true, true]);
  });
});
