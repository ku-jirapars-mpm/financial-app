import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { setChangeReason } from "../db";
import { bangkokDate, monthStart } from "../dates";
import type { AccountKind } from "../domain";
import { calculateSnapshot, type SnapshotValues } from "../snapshot-calc";
import { NotFoundError, UserFacingError } from "./errors";
import { lentOutstandingAsOf } from "./receivables";

export interface SnapshotRow extends Omit<SnapshotValues, "assumptions" | "metadata"> {
  id: string;
  assumptions: Record<string, string>;
  metadata: SnapshotValues["metadata"];
  source: "manual" | "rebuild";
  supersedes_id: string | null;
  superseded_by: string | null;
  superseded_at: Date | null;
  supersede_reason: string | null;
  created_at: Date;
}

/** Reads the current recorded data and computes snapshot values as of the end of `snapshotDate`. */
export async function computeSnapshot(db: Db, snapshotDate: string, today = bangkokDate()): Promise<SnapshotValues> {
  if (snapshotDate > today) throw new UserFacingError("Snapshots cannot be taken for a future date.");
  const periodStart = monthStart(snapshotDate);

  const { rows: accounts } = await db.query<{
    id: string;
    name: string;
    kind: AccountKind;
    opening_balance_date: string;
    balance_satang: number;
  }>(
    `select a.id, a.name, a.kind, a.opening_balance_date,
            (a.opening_balance_satang + coalesce(sum(t.amount_satang), 0))::bigint as balance_satang
     from accounts a
     left join transactions t
       on t.account_id = a.id and t.owner_id = a.owner_id
      and t.deleted_at is null and t.status = 'posted' and t.transaction_date <= $1
     group by a.id
     order by a.name`,
    [snapshotDate],
  );

  const { rows: flows } = await db.query<{ kind: AccountKind; type: string; amount_satang: number }>(
    `select a.kind, t.type, t.amount_satang
     from transactions t join accounts a on a.id = t.account_id
     where t.deleted_at is null and t.status = 'posted'
       and t.transaction_date between $1 and $2`,
    [periodStart, snapshotDate],
  );

  const { rows: inst } = await db.query<{ remaining: number }>(
    `select coalesce(sum(p.amount_due_satang
              - case when p.payment_date is not null and p.payment_date <= $1 then p.amount_paid_satang else 0 end), 0)::bigint
              as remaining
     from installment_payments p
     join installment_plans pl on pl.id = p.installment_plan_id
     where pl.status <> 'cancelled' and pl.start_date <= $1
       and p.status not in ('skipped', 'cancelled')`,
    [snapshotDate],
  );

  return calculateSnapshot({
    snapshotDate,
    periodStart,
    today,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      kind: a.kind,
      openingBalanceDate: a.opening_balance_date,
      balanceSatang: a.balance_satang,
    })),
    flows: flows.map((f) => ({ accountKind: f.kind, type: f.type, amountSatang: f.amount_satang })),
    remainingInstallmentsSatang: Math.max(0, inst[0]?.remaining ?? 0),
    receivablesSatang: await lentOutstandingAsOf(db, snapshotDate),
  });
}

const COLUMNS = [
  "snapshot_date",
  "period_start",
  "period_end",
  "total_cash_balance_satang",
  "total_bank_balance_satang",
  "total_other_assets_satang",
  "total_outstanding_liabilities_satang",
  "total_credit_card_debt_satang",
  "total_loan_debt_satang",
  "remaining_installment_obligations_satang",
  "monthly_income_satang",
  "monthly_expenses_satang",
  "monthly_debt_payments_satang",
  "net_cash_flow_satang",
  "net_financial_position_satang",
  "calculation_version",
  "data_basis",
  "assumptions",
  "metadata",
] as const;

async function insertSnapshot(
  db: Db,
  values: SnapshotValues,
  extra: { id?: string; source: "manual" | "rebuild"; supersedesId?: string | null },
): Promise<string> {
  const cols = [...COLUMNS, "id", "source", "supersedes_id"];
  const params = [
    ...COLUMNS.map((c) => (c === "assumptions" || c === "metadata" ? JSON.stringify(values[c]) : values[c])),
    extra.id ?? randomUUID(),
    extra.source,
    extra.supersedesId ?? null,
  ];
  const { rows } = await db.query<{ id: string }>(
    `insert into financial_snapshots (${cols.join(", ")})
     values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`,
    params,
  );
  return rows[0]!.id;
}

/**
 * Stores a new snapshot. If a current snapshot already exists for that date
 * it is never overwritten — the user must rebuild it explicitly.
 */
export async function createSnapshot(db: Db, snapshotDate: string, today = bangkokDate()): Promise<string> {
  const { rows } = await db.query(
    "select id from financial_snapshots where snapshot_date = $1 and superseded_by is null",
    [snapshotDate],
  );
  if (rows.length) {
    throw new UserFacingError("A snapshot already exists for this date. Use “Rebuild” to supersede it with a reason.");
  }
  const values = await computeSnapshot(db, snapshotDate, today);
  return insertSnapshot(db, values, { source: "manual" });
}

/**
 * Controlled rebuild: recomputes from current records and stores a NEW row
 * that supersedes the old one. The old snapshot's values stay unchanged.
 */
export async function rebuildSnapshot(db: Db, snapshotId: string, reason: string, today = bangkokDate()): Promise<string> {
  await setChangeReason(db, reason);
  const { rows } = await db.query<{ snapshot_date: string; superseded_by: string | null }>(
    "select snapshot_date, superseded_by from financial_snapshots where id = $1 for update",
    [snapshotId],
  );
  const old = rows[0];
  if (!old) throw new NotFoundError("snapshot");
  if (old.superseded_by) throw new UserFacingError("Only the current snapshot for a date can be rebuilt.");
  const values = await computeSnapshot(db, old.snapshot_date, today);
  const newId = randomUUID();
  // superseded_by FK is deferred, so the old row can point at the new id before it exists.
  await db.query(
    "update financial_snapshots set superseded_by = $2, superseded_at = now(), supersede_reason = $3 where id = $1",
    [snapshotId, newId, reason],
  );
  await insertSnapshot(db, values, { id: newId, source: "rebuild", supersedesId: snapshotId });
  return newId;
}

export async function listSnapshots(db: Db, opts: { includeSuperseded?: boolean } = {}): Promise<SnapshotRow[]> {
  const { rows } = await db.query<SnapshotRow>(
    `select * from financial_snapshots
     ${opts.includeSuperseded ? "" : "where superseded_by is null"}
     order by snapshot_date desc, created_at desc`,
  );
  return rows;
}
