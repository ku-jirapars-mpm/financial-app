import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Db } from "../db";
import { setChangeReason } from "../db";
import { canonicalJson, sha256Hex } from "../canonical-json";
import { UserFacingError } from "./errors";

export const BACKUP_FORMAT = "myfinance-backup";
export const BACKUP_FORMAT_VERSION = 1;

/** Tables in a full backup, in dependency (restore) order. */
export const BACKUP_TABLES = [
  "profiles",
  "categories",
  "accounts",
  "credit_cards",
  "loans",
  "credit_card_statements",
  "installment_plans",
  "receivables",
  "recurring_transactions",
  "transactions",
  "installment_payments",
  "debt_payments",
  "reconciliations",
  "budgets",
  "financial_snapshots",
  "audit_logs",
] as const;
export type BackupTable = (typeof BACKUP_TABLES)[number];

type Row = Record<string, unknown>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  format_version: number;
  schema_version: string;
  exported_at: string;
  owner_id: string;
  notice: string;
  tables: Record<BackupTable, Row[]>;
  integrity: {
    algorithm: "sha256";
    row_counts: Record<BackupTable, number>;
    /** Balance of every account computed at export time; re-checked after restore. */
    account_balances: Record<string, number>;
    checksum: string;
  };
}

const ORDER_BY: Partial<Record<BackupTable, string>> = {
  transactions: "transaction_date, created_at, id",
  financial_snapshots: "created_at, id",
  audit_logs: "changed_at, id",
  installment_payments: "installment_plan_id, sequence_no",
};

/** SHA-256 over the canonical JSON of everything except exported_at, notice and the checksum itself. */
export function backupChecksum(
  b: Pick<Backup, "format" | "format_version" | "schema_version" | "owner_id" | "tables"> & {
    integrity: Pick<Backup["integrity"], "account_balances">;
  },
): string {
  return sha256Hex(
    canonicalJson({
      format: b.format,
      format_version: b.format_version,
      schema_version: b.schema_version,
      owner_id: b.owner_id,
      tables: b.tables,
      account_balances: b.integrity.account_balances,
    }),
  );
}

async function schemaVersion(db: Db): Promise<string> {
  const { rows } = await db.query<{ name: string | null }>("select max(name) as name from schema_migrations");
  return rows[0]?.name ?? "unknown";
}

async function accountBalances(db: Db): Promise<Record<string, number>> {
  const { rows } = await db.query<{ account_id: string; balance_satang: number }>(
    "select account_id, balance_satang from account_balances order by account_id",
  );
  return Object.fromEntries(rows.map((r) => [r.account_id, r.balance_satang]));
}

/** Full JSON backup of every record owned by the current user (RLS-scoped). */
export async function createBackup(db: Db, ownerId: string): Promise<Backup> {
  const tables = {} as Record<BackupTable, Row[]>;
  for (const t of BACKUP_TABLES) {
    const { rows } = await db.query<Row>(`select * from ${t} order by ${ORDER_BY[t] ?? "id"}`);
    // Round-trip through JSON so Dates become ISO strings exactly as they will be stored.
    tables[t] = JSON.parse(JSON.stringify(rows)) as Row[];
  }
  const base = {
    format: BACKUP_FORMAT,
    format_version: BACKUP_FORMAT_VERSION,
    schema_version: await schemaVersion(db),
    owner_id: ownerId,
    tables,
  } as const;
  const account_balances = await accountBalances(db);
  return {
    ...base,
    exported_at: new Date().toISOString(),
    notice:
      "Complete MyFinance backup of one user's records. Amounts are integer satang (1 THB = 100 satang). Keep this file private.",
    integrity: {
      algorithm: "sha256",
      row_counts: Object.fromEntries(BACKUP_TABLES.map((t) => [t, tables[t].length])) as Record<BackupTable, number>,
      account_balances,
      checksum: backupChecksum({ ...base, integrity: { account_balances } }),
    },
  };
}

const rowSchema = z.record(z.string(), z.unknown()).refine((r) => typeof r.id === "string", "row without id");

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  format_version: z.literal(BACKUP_FORMAT_VERSION),
  schema_version: z.string(),
  exported_at: z.string(),
  owner_id: z.uuid(),
  notice: z.string().optional(),
  // Tables added in later versions default to empty so older backups still restore.
  tables: z.object(Object.fromEntries(BACKUP_TABLES.map((t) => [t, z.array(rowSchema).default([])])) as Record<
    BackupTable,
    z.ZodDefault<z.ZodArray<typeof rowSchema>>
  >),
  integrity: z.object({
    algorithm: z.literal("sha256"),
    row_counts: z.record(z.string(), z.number().int().min(0)),
    account_balances: z.record(z.string(), z.number().int()),
    checksum: z.string().regex(/^[0-9a-f]{64}$/),
  }),
});

export interface VerifyResult {
  ok: boolean;
  errors: string[];
  backup?: Backup;
}

/** Structural validation + checksum + row-count integrity check. Does not touch the database. */
export function verifyBackup(input: unknown): VerifyResult {
  const parsed = backupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 10).map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const b = parsed.data as unknown as Backup;
  const errors: string[] = [];
  // Checksum over the file exactly as written (before defaults were filled in).
  if (backupChecksum(input as Backup) !== b.integrity.checksum) errors.push("Checksum mismatch: the file was modified or corrupted.");
  for (const t of BACKUP_TABLES) {
    if ((b.integrity.row_counts[t] ?? 0) !== b.tables[t].length) errors.push(`Row count mismatch for ${t}.`);
    const ids = new Set(b.tables[t].map((r) => r.id));
    if (ids.size !== b.tables[t].length) errors.push(`Duplicate ids in ${t}.`);
  }
  return { ok: errors.length === 0, errors, backup: errors.length ? undefined : b };
}

async function insertableColumns(db: Db, table: string): Promise<Set<string>> {
  const { rows } = await db.query<{ column_name: string }>(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' and column_name <> 'owner_id'`,
    [table],
  );
  return new Set(rows.map((r) => r.column_name));
}

const JSON_COLUMNS = new Set(["assumptions", "metadata", "old_data", "new_data"]);

async function insertRows(db: Db, table: BackupTable, rows: Row[], override: (r: Row) => Row = (r) => r) {
  if (!rows.length) return;
  const allowed = await insertableColumns(db, table);
  for (const original of rows) {
    const r = override(original);
    const cols = Object.keys(r).filter((c) => c !== "owner_id" && c !== "difference_satang");
    const unknown = cols.filter((c) => !allowed.has(c));
    if (unknown.length) throw new UserFacingError(`Backup has columns this database does not know: ${table}.${unknown[0]}`);
    const values = cols.map((c) => (JSON_COLUMNS.has(c) && r[c] !== null ? JSON.stringify(r[c]) : r[c]));
    await db.query(
      `insert into ${table} (${cols.map((c) => `"${c}"`).join(", ")})
       values (${cols.map((_, i) => `$${i + 1}`).join(", ")})`,
      values,
    );
  }
}

async function currentUserId(db: Db): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select app.current_user_id() as id");
  if (!rows[0]?.id) throw new UserFacingError("Not signed in.");
  return rows[0].id;
}

export interface RestoreResult {
  restored: Record<BackupTable, number>;
  balancesVerified: number;
}

/**
 * Restores a verified backup into the current (empty) user. Runs inside the
 * caller's single database transaction: either everything is restored and
 * verified, or nothing is. Owner ids are re-stamped with the current user, so
 * a backup can be restored after re-registering on a fresh database.
 */
export async function restoreBackup(db: Db, backup: Backup): Promise<RestoreResult> {
  const check = verifyBackup(backup);
  if (!check.ok) throw new UserFacingError(`Backup failed integrity checks: ${check.errors.join(" ")}`);
  await setChangeReason(db, `restore from backup exported ${backup.exported_at}`);

  const { rows: existing } = await db.query<{ n: number }>(
    `select (select count(*) from accounts) + (select count(*) from transactions)
          + (select count(*) from financial_snapshots) as n`,
  );
  if (Number(existing[0]!.n) > 0) {
    throw new UserFacingError("Restore is only allowed into an empty profile (no accounts, transactions or snapshots).");
  }
  const T = backup.tables;

  // Profile: keep the current row, copy user-editable fields.
  const p = T.profiles[0];
  if (p) await db.query("update profiles set display_name = $1 where id = app.current_user_id()", [p.display_name ?? null]);

  // Every id is re-generated so a backup can be restored next to the original
  // data (e.g. into a second user in the same database) without collisions.
  // References are rewritten through the same map. Values inside audit
  // old_data/new_data keep the original ids as historical record.
  const ids = new Map<string, string>([[backup.owner_id, (await currentUserId(db))]]);
  const mapId = (v: unknown) => {
    if (v == null) return v;
    const k = String(v);
    if (!ids.has(k)) ids.set(k, randomUUID());
    return ids.get(k);
  };
  const remap = (r: Row): Row =>
    Object.fromEntries(
      Object.entries(r).map(([k, v]) =>
        k !== "owner_id" && (k === "id" || k.endsWith("_id") || k === "superseded_by") ? [k, mapId(v)] : [k, v],
      ),
    );

  // Categories: reuse any existing category with the same kind + name (e.g. defaults), else insert.
  const { rows: cats } = await db.query<{ id: string; kind: string; name: string }>("select id, kind, name from categories");
  const byKey = new Map(cats.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]));
  const pendingCats: Row[] = [];
  for (const c of T.categories) {
    const match = byKey.get(`${String(c.kind)}:${String(c.name).toLowerCase()}`);
    if (match) {
      ids.set(String(c.id), match);
      await db.query("update categories set is_archived = $2, color = $3 where id = $1", [match, c.is_archived, c.color ?? null]);
    } else {
      pendingCats.push(c);
    }
  }
  // Parents first.
  pendingCats.sort((a, b) => Number(a.parent_id != null) - Number(b.parent_id != null));
  await insertRows(db, "categories", pendingCats.map(remap));

  // Accounts start active so their history can be inserted; final status is applied at the end.
  await insertRows(
    db,
    "accounts",
    T.accounts.map((r) => remap({ ...r, status: "active", archived_at: null, closed_at: null, closed_reason: null })),
  );
  await insertRows(db, "credit_cards", T.credit_cards.map(remap));
  await insertRows(db, "loans", T.loans.map(remap));
  await insertRows(db, "credit_card_statements", T.credit_card_statements.map(remap));
  await insertRows(db, "installment_plans", T.installment_plans.map((r) => remap({ ...r, origin_transaction_id: null })));
  await insertRows(db, "receivables", T.receivables.map(remap));
  await insertRows(db, "recurring_transactions", T.recurring_transactions.map(remap));
  await insertRows(db, "transactions", T.transactions.map(remap));
  for (const plan of T.installment_plans) {
    if (plan.origin_transaction_id) {
      await db.query("update installment_plans set origin_transaction_id = $2 where id = $1", [
        mapId(plan.id),
        mapId(plan.origin_transaction_id),
      ]);
    }
  }
  await insertRows(db, "installment_payments", T.installment_payments.map(remap));
  await insertRows(db, "debt_payments", T.debt_payments.map(remap));
  await insertRows(db, "reconciliations", T.reconciliations.map(remap));
  await insertRows(db, "budgets", T.budgets.map(remap));
  await insertRows(db, "financial_snapshots", T.financial_snapshots.map(remap));
  await db.query("select app.restore_audit_logs($1::jsonb)", [JSON.stringify(T.audit_logs.map(remap))]);

  for (const a of T.accounts) {
    if (a.status !== "active") {
      await db.query(
        "update accounts set status = $2, archived_at = $3, closed_at = $4, closed_reason = $5 where id = $1",
        [mapId(a.id), a.status, a.archived_at, a.closed_at, a.closed_reason],
      );
    }
  }

  // Post-restore verification: every account balance must match the export.
  const balances = await accountBalances(db);
  let verified = 0;
  for (const [id, expected] of Object.entries(backup.integrity.account_balances)) {
    if (balances[String(mapId(id))] !== expected) {
      throw new UserFacingError("Restored balances do not match the backup. Nothing was restored.");
    }
    verified++;
  }
  // Force deferred constraints (transfer groups, snapshot links) to be checked now, inside this transaction.
  await db.query("set constraints all immediate");

  return {
    restored: Object.fromEntries(BACKUP_TABLES.map((t) => [t, T[t].length])) as Record<BackupTable, number>,
    balancesVerified: verified,
  };
}
