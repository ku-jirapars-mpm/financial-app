/**
 * Minimal, safe SQL migration runner.
 *   - Applies db/migrations/*.sql in filename order, each in its own transaction.
 *   - Records filename + SHA-256 checksum in schema_migrations.
 *   - Refuses to run if an already-applied migration file was modified or removed.
 *   - Takes an advisory lock so two deploys cannot migrate concurrently.
 *
 * Usage: DATABASE_URL_UNPOOLED=... npm run db:migrate   (or --status)
 */
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { Client } from "pg";
import { withStrictSsl } from "../src/lib/pg-url";

export const MIGRATIONS_DIR = join(import.meta.dirname, "..", "db", "migrations");
const LOCK_KEY = 728_391_004;

export interface MigrationFile {
  name: string;
  sql: string;
  checksum: string;
}

export function loadMigrations(dir = MIGRATIONS_DIR): MigrationFile[] {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const sql = readFileSync(join(dir, name), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    });
}

export async function migrate(
  connectionString: string,
  opts: { dir?: string; statusOnly?: boolean; log?: (msg: string) => void } = {},
): Promise<string[]> {
  const log = opts.log ?? console.log;
  const files = loadMigrations(opts.dir);
  const client = new Client({ connectionString: withStrictSsl(connectionString) });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    await client.query(`create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )`);
    const { rows } = await client.query<{ name: string; checksum: string }>(
      "select name, checksum from schema_migrations order by name",
    );
    const known = new Map(rows.map((r) => [r.name, r.checksum]));
    const fileNames = new Set(files.map((f) => f.name));
    for (const r of rows) {
      if (!fileNames.has(r.name)) throw new Error(`Applied migration ${r.name} is missing from ${MIGRATIONS_DIR}`);
    }
    for (const f of files) {
      const prev = known.get(f.name);
      if (prev && prev !== f.checksum) {
        throw new Error(`Migration ${f.name} was modified after being applied. Add a new migration instead.`);
      }
    }
    const pending = files.filter((f) => !known.has(f.name));
    if (opts.statusOnly) {
      log(`${rows.length} applied, ${pending.length} pending${pending.length ? ": " + pending.map((p) => p.name).join(", ") : ""}`);
      return [];
    }
    for (const f of pending) {
      await client.query("begin");
      try {
        await client.query(f.sql);
        await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [f.name, f.checksum]);
        await client.query("commit");
        applied.push(f.name);
        log(`applied ${f.name}`);
      } catch (err) {
        await client.query("rollback");
        throw new Error(`Migration ${f.name} failed and was rolled back: ${(err as Error).message}`);
      }
    }
    if (!pending.length) log("database is up to date");
    return applied;
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => undefined);
    await client.end();
  }
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL_UNPOOLED (preferred) or DATABASE_URL");
    process.exit(1);
  }
  migrate(url, { statusOnly: process.argv.includes("--status") }).catch((err) => {
    console.error((err as Error).message);
    process.exit(1);
  });
}
