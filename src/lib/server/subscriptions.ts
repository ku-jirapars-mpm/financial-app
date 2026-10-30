import type { Db } from "../db";
import { setChangeReason } from "../db";
import { addDays, occurrenceAfter, type Frequency } from "../dates";
import type { AccountKind } from "../domain";
import { ConcurrencyError, NotFoundError, UserFacingError } from "./errors";

/**
 * Subscriptions are recurring *expenses* stored in recurring_transactions.
 * Charges are never posted automatically: the user confirms each one (prices
 * and card FX vary), which posts a normal expense transaction linked back to
 * the subscription and moves the schedule to the next date.
 */
export interface SubscriptionRow {
  id: string;
  name: string;
  counterparty: string | null;
  amount_satang: number;
  frequency: Frequency;
  interval_count: number;
  start_date: string;
  next_occurrence_date: string | null;
  end_date: string | null;
  is_active: boolean;
  account_id: string;
  account_name: string;
  account_kind: AccountKind;
  category_id: string | null;
  category_name: string | null;
  last_paid_date: string | null;
  updated_at: Date;
}

export interface SubscriptionInput {
  name: string;
  counterparty: string | null;
  amount: number;
  accountId: string;
  categoryId: string | null;
  frequency: Frequency;
  intervalCount: number;
  nextDate: string;
}

const SELECT = `
  select r.id, r.description as name, r.counterparty, r.amount_satang, r.frequency, r.interval_count,
         r.start_date, r.next_occurrence_date, r.end_date, r.is_active, r.account_id,
         a.name as account_name, a.kind as account_kind, r.category_id, c.name as category_name,
         (select max(t.transaction_date) from transactions t
           where t.recurring_transaction_id = r.id and t.deleted_at is null) as last_paid_date,
         r.updated_at
  from recurring_transactions r
  join accounts a on a.id = r.account_id
  left join categories c on c.id = r.category_id
  where r.type = 'expense'`;

/** Average cost per month in satang (rounded), for totals. */
export function monthlyEquivalent(amount: number, frequency: Frequency, interval: number): number {
  const perYear = frequency === "weekly" ? 52 / interval : frequency === "monthly" ? 12 / interval : 1 / interval;
  return Math.round((amount * perYear) / 12);
}

export async function listSubscriptions(db: Db, opts: { includeCancelled?: boolean } = {}): Promise<SubscriptionRow[]> {
  const { rows } = await db.query<SubscriptionRow>(
    `${SELECT} ${opts.includeCancelled ? "" : "and r.is_active"}
     order by r.is_active desc, r.next_occurrence_date nulls last, lower(r.description)`,
  );
  return rows;
}

export async function getSubscription(db: Db, id: string): Promise<SubscriptionRow> {
  const { rows } = await db.query<SubscriptionRow>(`${SELECT} and r.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("subscription");
  return rows[0];
}

/** Active subscriptions charged on or before `until` (includes overdue ones). */
export async function dueSubscriptions(db: Db, until: string): Promise<SubscriptionRow[]> {
  const { rows } = await db.query<SubscriptionRow>(
    `${SELECT} and r.is_active and r.next_occurrence_date <= $1 order by r.next_occurrence_date, lower(r.description)`,
    [until],
  );
  return rows;
}

/** Uses the chosen category, or a "Subscriptions" expense category (created on first use). */
async function resolveCategory(db: Db, categoryId: string | null): Promise<string> {
  if (categoryId) return categoryId;
  const { rows } = await db.query<{ id: string }>(
    `with existing as (
       select id from categories where kind = 'expense' and lower(name) = 'subscriptions'
     ), created as (
       insert into categories (name, kind) select 'Subscriptions', 'expense'
       where not exists (select 1 from existing) returning id
     )
     select id from existing union all select id from created`,
  );
  return rows[0]!.id;
}

export async function createSubscription(db: Db, input: SubscriptionInput): Promise<string> {
  const categoryId = await resolveCategory(db, input.categoryId);
  const { rows } = await db.query<{ id: string }>(
    `insert into recurring_transactions
       (account_id, category_id, type, amount_satang, description, counterparty, frequency, interval_count,
        start_date, next_occurrence_date)
     values ($1, $2, 'expense', $3, $4, $5, $6, $7, $8, $8) returning id`,
    [input.accountId, categoryId, input.amount, input.name, input.counterparty, input.frequency, input.intervalCount, input.nextDate],
  );
  return rows[0]!.id;
}

/** Edits price/schedule/details. A new next date re-anchors the schedule to it. */
export async function updateSubscription(db: Db, id: string, input: SubscriptionInput): Promise<void> {
  await setChangeReason(db, "subscription edited");
  const current = await getSubscription(db, id);
  const categoryId = await resolveCategory(db, input.categoryId);
  const reanchor = input.nextDate !== current.next_occurrence_date || input.frequency !== current.frequency
    || input.intervalCount !== current.interval_count;
  await db.query(
    `update recurring_transactions
       set description = $2, counterparty = $3, amount_satang = $4, account_id = $5, category_id = $6,
           frequency = $7, interval_count = $8, next_occurrence_date = $9,
           start_date = case when $10 then $9::date else start_date end
     where id = $1`,
    [id, input.name, input.counterparty, input.amount, input.accountId, categoryId, input.frequency,
     input.intervalCount, input.nextDate, reanchor],
  );
}

async function lockActive(db: Db, id: string, expectedDate: string, idempotencyKey?: string) {
  const { rows } = await db.query<{ is_active: boolean; next_occurrence_date: string | null; start_date: string;
    frequency: Frequency; interval_count: number; end_date: string | null }>(
    `select is_active, next_occurrence_date, start_date, frequency, interval_count, end_date
     from recurring_transactions where id = $1 and type = 'expense' for update`,
    [id],
  );
  const r = rows[0];
  if (!r) throw new NotFoundError("subscription");
  // Checked after taking the row lock, so a concurrent double tap waits for
  // the first request and then finds its payment instead of failing.
  if (idempotencyKey) {
    const { rows: done } = await db.query<{ id: string }>("select id from transactions where idempotency_key = $1", [idempotencyKey]);
    if (done[0]) return { ...r, alreadyRecorded: done[0].id };
  }
  if (!r.is_active) throw new UserFacingError("This subscription is paused or cancelled.");
  if (r.next_occurrence_date !== expectedDate) throw new ConcurrencyError("subscription");
  return { ...r, alreadyRecorded: null as string | null };
}

async function advance(db: Db, id: string, r: Awaited<ReturnType<typeof lockActive>>, from: string) {
  const next = occurrenceAfter(r.start_date, r.frequency, r.interval_count, from);
  const ended = r.end_date !== null && next > r.end_date;
  await db.query(
    "update recurring_transactions set next_occurrence_date = $2, is_active = $3 where id = $1",
    [id, ended ? null : next, !ended],
  );
}

/**
 * Records the charge due on `dueDate` as an expense and moves the schedule
 * forward, atomically. The idempotency key is derived from the subscription
 * and due date, so a double tap or retry can never post the charge twice.
 */
export async function recordSubscriptionCharge(
  db: Db,
  input: { id: string; dueDate: string; amount: number; date: string },
): Promise<{ transactionId: string; created: boolean }> {
  const key = `recurring:${input.id}:${input.dueDate}`;
  const r = await lockActive(db, input.id, input.dueDate, key);
  if (r.alreadyRecorded) return { transactionId: r.alreadyRecorded, created: false };
  const sub = await getSubscription(db, input.id);
  const { rows } = await db.query<{ id: string }>(
    `insert into transactions
       (account_id, category_id, type, amount_satang, transaction_date, description, counterparty,
        recurring_transaction_id, idempotency_key)
     values ($1, $2, 'expense', $3, $4, $5, $6, $7, $8)
     on conflict (owner_id, idempotency_key) where idempotency_key is not null do nothing
     returning id`,
    [sub.account_id, sub.category_id, -input.amount, input.date, sub.name, sub.counterparty, input.id, key],
  );
  if (!rows[0]) {
    const again = await db.query<{ id: string }>("select id from transactions where idempotency_key = $1", [key]);
    return { transactionId: again.rows[0]!.id, created: false };
  }
  await advance(db, input.id, r, input.dueDate);
  return { transactionId: rows[0].id, created: true };
}

/** Skips the charge due on `dueDate` without recording a payment. */
export async function skipSubscriptionCharge(db: Db, id: string, dueDate: string): Promise<void> {
  await setChangeReason(db, `skipped charge due ${dueDate}`);
  const r = await lockActive(db, id, dueDate);
  await advance(db, id, r, dueDate);
}

/** Pause/resume/cancel. Cancelled subscriptions keep their payment history. */
export async function setSubscriptionState(
  db: Db,
  id: string,
  state: "active" | "paused" | "cancelled",
  today: string,
): Promise<void> {
  await setChangeReason(db, `subscription ${state}`);
  const { rows } = await db.query<{ start_date: string; frequency: Frequency; interval_count: number; next_occurrence_date: string | null }>(
    "select start_date, frequency, interval_count, next_occurrence_date from recurring_transactions where id = $1 and type = 'expense' for update",
    [id],
  );
  const r = rows[0];
  if (!r) throw new NotFoundError("subscription");
  if (state === "active") {
    // Resume from the next scheduled date that isn't in the past.
    const next = r.next_occurrence_date && r.next_occurrence_date >= today
      ? r.next_occurrence_date
      : occurrenceAfter(r.start_date, r.frequency, r.interval_count, addDays(today, -1));
    await db.query("update recurring_transactions set is_active = true, end_date = null, next_occurrence_date = $2 where id = $1", [id, next]);
  } else if (state === "paused") {
    await db.query("update recurring_transactions set is_active = false where id = $1", [id]);
  } else {
    await db.query(
      "update recurring_transactions set is_active = false, end_date = greatest($2::date, start_date), next_occurrence_date = null where id = $1",
      [id, today],
    );
  }
}

export interface SubscriptionPayment {
  id: string;
  transaction_date: string;
  amount_satang: number;
  deleted_at: Date | null;
}

export async function subscriptionPayments(db: Db, id: string): Promise<SubscriptionPayment[]> {
  const { rows } = await db.query<SubscriptionPayment>(
    `select id, transaction_date, amount_satang, deleted_at from transactions
     where recurring_transaction_id = $1 order by transaction_date desc, created_at desc limit 50`,
    [id],
  );
  return rows;
}
