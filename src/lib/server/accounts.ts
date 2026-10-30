import type { Db } from "../db";
import { setChangeReason } from "../db";
import { isLiability, type AccountKind, type AccountStatus } from "../domain";
import type { AccountCreateInput } from "../validation";
import { ConcurrencyError, NotFoundError, UserFacingError } from "./errors";

export interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  status: AccountStatus;
  opening_balance_satang: number;
  opening_balance_date: string;
  notes: string | null;
  closed_reason: string | null;
  archived_at: Date | null;
  closed_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  balance_satang: number;
  last_transaction_date: string | null;
}

const SELECT_ACCOUNT = `
  select a.id, a.name, a.kind, a.institution, a.status, a.opening_balance_satang, a.opening_balance_date,
         a.notes, a.closed_reason, a.archived_at, a.closed_at, a.version, a.created_at, a.updated_at,
         b.balance_satang, b.last_transaction_date
  from accounts a
  join account_balances b on b.account_id = a.id`;

export async function listAccounts(db: Db, opts: { includeInactive?: boolean } = {}): Promise<AccountRow[]> {
  const { rows } = await db.query<AccountRow>(
    `${SELECT_ACCOUNT}
     ${opts.includeInactive ? "" : "where a.status = 'active'"}
     order by a.status, a.kind, a.name`,
  );
  return rows;
}

export async function getAccount(db: Db, id: string): Promise<AccountRow> {
  const { rows } = await db.query<AccountRow>(`${SELECT_ACCOUNT} where a.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("account");
  return rows[0];
}

export async function createAccount(db: Db, input: AccountCreateInput): Promise<string> {
  // Liabilities are entered as "amount owed" and stored as a negative balance.
  const opening = isLiability(input.kind) ? -input.openingBalance : input.openingBalance;
  const { rows } = await db.query<{ id: string }>(
    `insert into accounts (name, kind, institution, opening_balance_satang, opening_balance_date, notes)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.name, input.kind, input.institution, opening, input.openingBalanceDate, input.notes],
  );
  return rows[0]!.id;
}

export async function updateAccountDetails(
  db: Db,
  input: { id: string; expectedVersion: number; name: string; institution: string | null; notes: string | null },
): Promise<void> {
  const { rowCount } = await db.query(
    `update accounts set name = $3, institution = $4, notes = $5
     where id = $1 and version = $2`,
    [input.id, input.expectedVersion, input.name, input.institution, input.notes],
  );
  if (!rowCount) {
    await getAccount(db, input.id);
    throw new ConcurrencyError("account");
  }
}

/** Archive, close or reopen an account. History is always preserved. */
export async function setAccountStatus(db: Db, id: string, status: AccountStatus, reason: string): Promise<void> {
  await setChangeReason(db, reason);
  const { rows } = await db.query<{ status: AccountStatus }>(
    "select status from accounts where id = $1 for update",
    [id],
  );
  if (!rows[0]) throw new NotFoundError("account");
  if (rows[0].status === status) return;
  await db.query(
    `update accounts set
       status = $2,
       archived_at = case when $2 = 'archived' then now() else null end,
       closed_at = case when $2 = 'closed' then now() else null end,
       closed_reason = case when $2 = 'closed' then $3 else null end
     where id = $1`,
    [id, status, reason],
  );
}

/** Balance of one account at the end of `asOf` (Bangkok calendar date). */
export async function balanceAsOf(db: Db, accountId: string, asOf: string): Promise<number> {
  const { rows } = await db.query<{ balance: number }>(
    `select (a.opening_balance_satang + coalesce(sum(t.amount_satang), 0))::bigint as balance
     from accounts a
     left join transactions t
       on t.account_id = a.id and t.owner_id = a.owner_id
      and t.deleted_at is null and t.status = 'posted' and t.transaction_date <= $2
     where a.id = $1
     group by a.id`,
    [accountId, asOf],
  );
  if (!rows[0]) throw new NotFoundError("account");
  return rows[0].balance;
}

export interface ReconcileResult {
  reconciliationId: string;
  differenceSatang: number;
  adjustmentTransactionId: string | null;
}

/**
 * Records a reconciliation event against an external statement balance and,
 * when requested, posts an adjustment transaction for the difference. Both
 * rows are written in the caller's database transaction.
 */
export async function reconcileAccount(
  db: Db,
  input: { accountId: string; asOf: string; statementBalance: number; reason: string | null; createAdjustment: boolean },
): Promise<ReconcileResult> {
  const { rows: acc } = await db.query<{ kind: AccountKind; status: AccountStatus }>(
    "select kind, status from accounts where id = $1 for update",
    [input.accountId],
  );
  if (!acc[0]) throw new NotFoundError("account");
  const statementBalance = isLiability(acc[0].kind) ? -input.statementBalance : input.statementBalance;
  const recorded = await balanceAsOf(db, input.accountId, input.asOf);
  const difference = statementBalance - recorded;
  if (difference !== 0 && !input.reason) {
    throw new UserFacingError("The balances differ — explain the adjustment reason.");
  }
  await setChangeReason(db, input.reason ?? "reconciliation");

  let adjustmentId: string | null = null;
  if (difference !== 0 && input.createAdjustment) {
    const { rows } = await db.query<{ id: string }>(
      `insert into transactions (account_id, type, amount_satang, transaction_date, description, notes)
       values ($1, 'adjustment', $2, $3, 'Reconciliation adjustment', $4) returning id`,
      [input.accountId, difference, input.asOf, input.reason],
    );
    adjustmentId = rows[0]!.id;
  }
  const { rows } = await db.query<{ id: string }>(
    `insert into reconciliations
       (account_id, reconciled_as_of, statement_balance_satang, recorded_balance_satang, adjustment_transaction_id, reason)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [input.accountId, input.asOf, statementBalance, recorded, adjustmentId, input.reason],
  );
  return { reconciliationId: rows[0]!.id, differenceSatang: difference, adjustmentTransactionId: adjustmentId };
}

export interface ReconciliationRow {
  id: string;
  reconciled_as_of: string;
  statement_balance_satang: number;
  recorded_balance_satang: number;
  difference_satang: number;
  adjustment_transaction_id: string | null;
  reason: string | null;
  created_at: Date;
}

export async function listReconciliations(db: Db, accountId: string): Promise<ReconciliationRow[]> {
  const { rows } = await db.query<ReconciliationRow>(
    `select id, reconciled_as_of, statement_balance_satang, recorded_balance_satang, difference_satang,
            adjustment_transaction_id, reason, created_at
     from reconciliations where account_id = $1
     order by reconciled_as_of desc, created_at desc`,
    [accountId],
  );
  return rows;
}
