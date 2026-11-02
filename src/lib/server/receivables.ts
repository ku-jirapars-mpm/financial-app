import type { Db } from "../db";
import { setChangeReason } from "../db";
import { RECEIVABLE_PAYMENT_TYPE, type ReceivableKind } from "../domain";
import { ConcurrencyError, NotFoundError, UserFacingError } from "./errors";

/**
 * Money owed to the user (ลูกหนี้). The amount received is always the sum of
 * linked, non-deleted payment transactions, so the status can never disagree
 * with the ledger.
 *
 * Net worth: money already paid out (loans, reimbursements, other) is still
 * the user's asset and counts towards net worth. Unpaid work was never
 * received, so it is shown as "expected" but not counted until it is paid.
 */
export interface ReceivableRow {
  id: string;
  kind: ReceivableKind;
  person: string;
  description: string;
  amount_satang: number;
  received_satang: number;
  remaining_satang: number;
  issued_date: string;
  due_date: string | null;
  notes: string | null;
  written_off_at: Date | null;
  written_off_reason: string | null;
  version: number;
  created_at: Date;
  status: "open" | "partial" | "paid" | "written_off";
}

const SELECT = `
  select r.id, r.kind, r.person, r.description, r.amount_satang, r.issued_date, r.due_date, r.notes,
         r.written_off_at, r.written_off_reason, r.version, r.created_at,
         coalesce(p.received, 0)::bigint as received_satang,
         greatest(r.amount_satang - coalesce(p.received, 0), 0)::bigint as remaining_satang,
         case when r.written_off_at is not null then 'written_off'
              when coalesce(p.received, 0) >= r.amount_satang then 'paid'
              when coalesce(p.received, 0) > 0 then 'partial'
              else 'open' end as status
  from receivables r
  left join lateral (
    select sum(t.amount_satang) as received from transactions t
    where t.receivable_id = r.id and t.deleted_at is null and t.amount_satang > 0
  ) p on true`;

export async function listReceivables(db: Db): Promise<ReceivableRow[]> {
  const { rows } = await db.query<ReceivableRow>(
    `${SELECT} order by (r.written_off_at is null and coalesce(p.received, 0) < r.amount_satang) desc,
                        r.due_date nulls last, r.issued_date desc`,
  );
  return rows;
}

export async function getReceivable(db: Db, id: string): Promise<ReceivableRow> {
  const { rows } = await db.query<ReceivableRow>(`${SELECT} where r.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("record");
  return rows[0];
}

export interface ReceivableTotals {
  /** Still owed for money already paid out (loans, reimbursements, other) — part of net worth. */
  lentOutstandingSatang: number;
  /** Still owed for unpaid work — expected, not yet counted in net worth. */
  workOutstandingSatang: number;
  overdueCount: number;
}

export async function receivableTotals(db: Db, today: string): Promise<ReceivableTotals> {
  const { rows } = await db.query<{ lent: number; work: number; overdue: number }>(
    `with open as (${SELECT} where r.written_off_at is null)
     select coalesce(sum(remaining_satang) filter (where kind <> 'work'), 0)::bigint as lent,
            coalesce(sum(remaining_satang) filter (where kind = 'work'), 0)::bigint as work,
            count(*) filter (where remaining_satang > 0 and due_date < $1)::int as overdue
     from open`,
    [today],
  );
  const r = rows[0]!;
  return { lentOutstandingSatang: r.lent, workOutstandingSatang: r.work, overdueCount: r.overdue };
}

/** Outstanding, non-work receivables as of the end of `date` (for snapshots). */
export async function lentOutstandingAsOf(db: Db, date: string): Promise<number> {
  const { rows } = await db.query<{ total: number }>(
    `select coalesce(sum(greatest(r.amount_satang - coalesce(p.received, 0), 0)), 0)::bigint as total
     from receivables r
     left join lateral (
       select sum(t.amount_satang) as received from transactions t
       where t.receivable_id = r.id and t.deleted_at is null and t.amount_satang > 0 and t.transaction_date <= $1
     ) p on true
     where r.kind <> 'work' and r.issued_date <= $1
       and (r.written_off_at is null or (r.written_off_at at time zone 'Asia/Bangkok')::date > $1)`,
    [date],
  );
  return rows[0]!.total;
}

export interface ReceivableInput {
  kind: ReceivableKind;
  person: string;
  description: string;
  amount: number;
  issuedDate: string;
  dueDate: string | null;
  notes: string | null;
  /** Loans only: the account the money left from (records a `lend` transaction). */
  fromAccountId: string | null;
  idempotencyKey: string;
}

/** Creates the record and, for a loan paid from an account, the cash-out — atomically and idempotently. */
export async function createReceivable(db: Db, input: ReceivableInput): Promise<{ id: string; created: boolean }> {
  const { rows } = await db.query<{ id: string }>(
    `insert into receivables (kind, person, description, amount_satang, issued_date, due_date, notes, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (owner_id, idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [input.kind, input.person, input.description, input.amount, input.issuedDate, input.dueDate, input.notes, input.idempotencyKey],
  );
  if (!rows[0]) {
    // Same submission again (double tap / retry): return the original record.
    const { rows: existing } = await db.query<{ id: string }>(
      "select id from receivables where idempotency_key = $1",
      [input.idempotencyKey],
    );
    return { id: existing[0]!.id, created: false };
  }
  const id = rows[0].id;
  if (input.kind === "loan" && input.fromAccountId) {
    const { rows: tx } = await db.query(
      `insert into transactions
         (account_id, type, amount_satang, transaction_date, description, counterparty, receivable_id, idempotency_key)
       values ($1, 'lend', $2, $3, $4, $5, $6, $7)
       on conflict (owner_id, idempotency_key) where idempotency_key is not null do nothing
       returning id`,
      [input.fromAccountId, -input.amount, input.issuedDate, input.description || `Lent to ${input.person}`,
       input.person, id, input.idempotencyKey],
    );
    if (!tx[0]) throw new ConcurrencyError("record");
  }
  return { id, created: true };
}

export async function updateReceivable(
  db: Db,
  input: { id: string; expectedVersion: number; person: string; description: string; amount: number; dueDate: string | null; notes: string | null },
): Promise<void> {
  await setChangeReason(db, "details edited");
  const current = await getReceivable(db, input.id);
  if (current.version !== input.expectedVersion) throw new ConcurrencyError("record");
  if (input.amount < current.received_satang) {
    throw new UserFacingError("The amount can't be less than what you've already received.");
  }
  if (input.dueDate && input.dueDate < current.issued_date) throw new UserFacingError("Due date can't be before the start date.");
  await db.query(
    `update receivables set person = $3, description = $4, amount_satang = $5, due_date = $6, notes = $7
     where id = $1 and version = $2`,
    [input.id, input.expectedVersion, input.person, input.description, input.amount, input.dueDate, input.notes],
  );
}

/**
 * Records money received. Unpaid work → income; loans/other → money returned
 * (not income); reimbursements → refund (reduces spending).
 */
export async function recordReceivablePayment(
  db: Db,
  input: { id: string; amount: number; date: string; accountId: string; categoryId: string | null; idempotencyKey: string },
): Promise<{ transactionId: string; created: boolean }> {
  // Lock the record so two payments can't both pass the "not more than remaining" check,
  // then look for this submission: a concurrent double tap waits here and finds the first payment.
  await db.query("select id from receivables where id = $1 for update", [input.id]);
  const { rows: dup } = await db.query<{ id: string }>("select id from transactions where idempotency_key = $1", [input.idempotencyKey]);
  if (dup[0]) return { transactionId: dup[0].id, created: false };
  const r = await getReceivable(db, input.id);
  if (r.written_off_at) throw new UserFacingError("This was written off. Reopen it to record a payment.");
  if (input.amount > r.remaining_satang) {
    throw new UserFacingError("That's more than the amount still owed.");
  }
  const type = RECEIVABLE_PAYMENT_TYPE[r.kind];
  const { rows } = await db.query<{ id: string }>(
    `insert into transactions
       (account_id, category_id, type, amount_satang, transaction_date, description, counterparty, receivable_id, idempotency_key)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (owner_id, idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [input.accountId, type === "collect" ? null : input.categoryId, type, input.amount, input.date,
     r.description || `From ${r.person}`, r.person, r.id, input.idempotencyKey],
  );
  if (!rows[0]) {
    const again = await db.query<{ id: string }>("select id from transactions where idempotency_key = $1", [input.idempotencyKey]);
    return { transactionId: again.rows[0]!.id, created: false };
  }
  return { transactionId: rows[0].id, created: true };
}

/** Writes off what's still owed (e.g. they will never pay) or reopens it. History is kept. */
export async function setReceivableWrittenOff(db: Db, id: string, writtenOff: boolean, reason: string): Promise<void> {
  await setChangeReason(db, reason);
  const { rowCount } = await db.query(
    writtenOff
      ? "update receivables set written_off_at = now(), written_off_reason = $2 where id = $1 and written_off_at is null"
      : "update receivables set written_off_at = null, written_off_reason = null where id = $1 and written_off_at is not null",
    writtenOff ? [id, reason] : [id],
  );
  if (!rowCount) await getReceivable(db, id);
}

export interface ReceivablePayment {
  id: string;
  type: string;
  transaction_date: string;
  amount_satang: number;
  account_name: string;
  deleted_at: Date | null;
}

export async function receivableTransactions(db: Db, id: string): Promise<ReceivablePayment[]> {
  const { rows } = await db.query<ReceivablePayment>(
    `select t.id, t.type, t.transaction_date, t.amount_satang, a.name as account_name, t.deleted_at
     from transactions t join accounts a on a.id = t.account_id
     where t.receivable_id = $1 order by t.transaction_date desc, t.created_at desc`,
    [id],
  );
  return rows;
}
