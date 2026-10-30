import type { Db } from "../db";
import { setChangeReason } from "../db";
import { cardCycle, daysBetween, dueDateForStatement, minimumPayment } from "../credit-card";
import { NotFoundError, UserFacingError } from "./errors";

export interface CardDetails {
  id: string;
  account_id: string;
  credit_limit_satang: number;
  statement_day: number;
  due_day: number;
  min_payment_rate_bps: number;
  min_payment_floor_satang: number;
  annual_interest_rate_bps: number;
}

export interface CardDetailsInput {
  creditLimit: number;
  statementDay: number;
  dueDay: number;
}

export async function getCardDetails(db: Db, accountId: string): Promise<CardDetails | null> {
  const { rows } = await db.query<CardDetails>(
    `select id, account_id, credit_limit_satang, statement_day, due_day, min_payment_rate_bps,
            min_payment_floor_satang, annual_interest_rate_bps
     from credit_cards where account_id = $1`,
    [accountId],
  );
  return rows[0] ?? null;
}

/** Creates or updates the card terms for a credit-card account (audited). */
export async function saveCardDetails(db: Db, accountId: string, input: CardDetailsInput): Promise<void> {
  const { rows } = await db.query<{ kind: string }>("select kind from accounts where id = $1", [accountId]);
  if (!rows[0]) throw new NotFoundError("account");
  if (rows[0].kind !== "credit_card") throw new UserFacingError("Card details apply to credit card accounts only.");
  await setChangeReason(db, "card details updated");
  await db.query(
    `insert into credit_cards (account_id, credit_limit_satang, statement_day, due_day)
     values ($1, $2, $3, $4)
     on conflict (account_id) do update
       set credit_limit_satang = excluded.credit_limit_satang,
           statement_day = excluded.statement_day,
           due_day = excluded.due_day`,
    [accountId, input.creditLimit, input.statementDay, input.dueDay],
  );
}

export interface CardStatus {
  details: CardDetails;
  /** Everything owed now, billed or not (from recorded transactions). */
  usedSatang: number;
  availableSatang: number;
  usedShare: number;
  lastStatement: string;
  nextStatement: string;
  /** Due date of the last closed statement (may be in the past). */
  dueDate: string;
  daysUntilDue: number;
  /** Due date of the statement that will close next. */
  nextDueDate: string;
  /**
   * Estimated amount still to pay by `dueDate`: what was owed when the last
   * statement closed, minus payments/refunds since. Null when the account's
   * history doesn't reach back to that statement.
   */
  dueSatang: number | null;
  minimumSatang: number | null;
}

export async function cardStatus(db: Db, accountId: string, today: string): Promise<CardStatus | null> {
  const details = await getCardDetails(db, accountId);
  if (!details) return null;
  const cycle = cardCycle(today, details.statement_day, details.due_day);
  const { rows } = await db.query<{
    balance: number;
    balance_at_statement: number;
    credits_since: number;
    opening_date: string;
  }>(
    `select (a.opening_balance_satang + coalesce(sum(t.amount_satang), 0))::bigint as balance,
            (a.opening_balance_satang
              + coalesce(sum(t.amount_satang) filter (where t.transaction_date <= $2), 0))::bigint as balance_at_statement,
            coalesce(sum(t.amount_satang) filter (where t.transaction_date > $2 and t.amount_satang > 0), 0)::bigint
              as credits_since,
            a.opening_balance_date as opening_date
     from accounts a
     left join transactions t
       on t.account_id = a.id and t.owner_id = a.owner_id and t.deleted_at is null and t.status = 'posted'
     where a.id = $1
     group by a.id`,
    [accountId, cycle.lastStatement],
  );
  const r = rows[0];
  if (!r) throw new NotFoundError("account");
  const used = Math.max(0, -r.balance);
  const limit = details.credit_limit_satang;
  const knownStatement = r.opening_date <= cycle.lastStatement;
  const due = knownStatement ? Math.max(0, Math.max(0, -r.balance_at_statement) - r.credits_since) : null;
  return {
    details,
    usedSatang: used,
    availableSatang: limit - used,
    usedShare: limit > 0 ? Math.min(1, used / limit) : 0,
    lastStatement: cycle.lastStatement,
    nextStatement: cycle.nextStatement,
    dueDate: cycle.currentDue,
    daysUntilDue: daysBetween(today, cycle.currentDue),
    nextDueDate: dueDateForStatement(cycle.nextStatement, details.statement_day, details.due_day),
    dueSatang: due,
    minimumSatang: due === null ? null : minimumPayment(due, details.min_payment_rate_bps, details.min_payment_floor_satang),
  };
}

/** Status for every active credit card that has details set up. */
export async function allCardStatuses(db: Db, today: string): Promise<(CardStatus & { accountName: string })[]> {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select a.id, a.name from accounts a join credit_cards c on c.account_id = a.id
     where a.status = 'active' order by a.name`,
  );
  const out: (CardStatus & { accountName: string })[] = [];
  for (const a of rows) {
    const s = await cardStatus(db, a.id, today);
    if (s) out.push({ ...s, accountName: a.name });
  }
  return out;
}
