import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { setChangeReason } from "../db";
import { signedAmount, type AccountKind, type TransactionType } from "../domain";
import type { TransactionEntry, TransactionFilter, TransactionUpdate } from "../validation";
import { ConcurrencyError, NotFoundError, UserFacingError } from "./errors";

export interface TransactionRow {
  id: string;
  account_id: string;
  account_name: string;
  account_kind: AccountKind;
  category_id: string | null;
  category_name: string | null;
  type: TransactionType;
  amount_satang: number;
  transaction_date: string;
  description: string;
  counterparty: string | null;
  notes: string | null;
  status: "posted" | "pending";
  transfer_group_id: string | null;
  counterpart_account_name: string | null;
  deleted_at: Date | null;
  deleted_reason: string | null;
  version: number;
  created_at: Date;
  updated_at: Date;
}

const SELECT_TX = `
  select t.id, t.account_id, a.name as account_name, a.kind as account_kind,
         t.category_id, c.name as category_name, t.type, t.amount_satang, t.transaction_date,
         t.description, t.counterparty, t.notes, t.status, t.transfer_group_id,
         (select a2.name from transactions t2 join accounts a2 on a2.id = t2.account_id
           where t2.transfer_group_id = t.transfer_group_id and t2.id <> t.id limit 1) as counterpart_account_name,
         t.deleted_at, t.deleted_reason, t.version, t.created_at, t.updated_at
  from transactions t
  join accounts a on a.id = t.account_id
  left join categories c on c.id = t.category_id`;

export interface CreateResult {
  id: string;
  /** False when the idempotency key matched an earlier submission. */
  created: boolean;
}

async function findByIdempotencyKey(db: Db, key: string): Promise<string | null> {
  const { rows } = await db.query<{ id: string }>("select id from transactions where idempotency_key = $1", [key]);
  return rows[0]?.id ?? null;
}

/**
 * Records a new income/expense/transfer/debt payment. Multi-row entries are
 * written in the caller's database transaction so they commit atomically.
 * The idempotency key makes repeated submissions (double taps, retries)
 * return the original record instead of creating a duplicate.
 */
export async function createTransaction(db: Db, entry: TransactionEntry): Promise<CreateResult> {
  switch (entry.type) {
    case "income":
    case "expense":
    case "fee":
    case "interest":
    case "refund": {
      const { rows } = await db.query<{ id: string }>(
        `insert into transactions
           (account_id, category_id, type, amount_satang, transaction_date, description, counterparty, notes, idempotency_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (owner_id, idempotency_key) where idempotency_key is not null do nothing
         returning id`,
        [
          entry.accountId,
          entry.categoryId,
          entry.type,
          signedAmount(entry.type, entry.amount),
          entry.date,
          entry.description,
          entry.counterparty,
          entry.notes,
          entry.idempotencyKey,
        ],
      );
      if (rows[0]) return { id: rows[0].id, created: true };
      const existing = await findByIdempotencyKey(db, entry.idempotencyKey);
      if (!existing) throw new UserFacingError("Duplicate submission could not be resolved.");
      return { id: existing, created: false };
    }
    case "transfer":
    case "debt_payment": {
      if (entry.accountId === entry.toAccountId) throw new UserFacingError("Choose two different accounts.");
      const group = randomUUID();
      const { rows } = await db.query<{ id: string }>(
        `insert into transactions
           (account_id, type, amount_satang, transaction_date, description, notes, transfer_group_id, idempotency_key)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (owner_id, idempotency_key) where idempotency_key is not null do nothing
         returning id`,
        [entry.accountId, entry.type, -entry.amount, entry.date, entry.description, entry.notes, group, entry.idempotencyKey],
      );
      if (!rows[0]) {
        const existing = await findByIdempotencyKey(db, entry.idempotencyKey);
        if (!existing) throw new UserFacingError("Duplicate submission could not be resolved.");
        return { id: existing, created: false };
      }
      const { rows: inLeg } = await db.query<{ id: string }>(
        `insert into transactions
           (account_id, type, amount_satang, transaction_date, description, notes, transfer_group_id)
         values ($1, $2, $3, $4, $5, $6, $7) returning id`,
        [entry.toAccountId, entry.type, entry.amount, entry.date, entry.description, entry.notes, group],
      );
      if (entry.type === "debt_payment") {
        await recordDebtPayment(db, inLeg[0]!.id, entry.toAccountId, entry.date, entry.amount, entry.interest, entry.fees);
      }
      return { id: rows[0].id, created: true };
    }
  }
}

async function recordDebtPayment(
  db: Db,
  liabilityLegId: string,
  liabilityAccountId: string,
  date: string,
  amount: number,
  interest: number,
  fees: number,
): Promise<void> {
  if (interest + fees > amount) throw new UserFacingError("Interest and fees cannot exceed the payment amount.");
  const { rows } = await db.query<{ kind: AccountKind; loan_id: string | null; credit_card_id: string | null }>(
    `select a.kind, l.id as loan_id, cc.id as credit_card_id
     from accounts a
     left join loans l on l.account_id = a.id
     left join credit_cards cc on cc.account_id = a.id
     where a.id = $1`,
    [liabilityAccountId],
  );
  const acc = rows[0];
  if (!acc) throw new NotFoundError("account");
  if (acc.kind !== "credit_card" && acc.kind !== "loan" && acc.kind !== "other_liability") {
    throw new UserFacingError("A debt payment must go to a credit card, loan or other liability account.");
  }
  const debtKind = acc.loan_id ? "loan" : acc.credit_card_id ? "credit_card" : "other";
  await db.query(
    `insert into debt_payments
       (transaction_id, debt_kind, loan_id, credit_card_id, payment_date, amount_satang,
        principal_satang, interest_satang, fees_satang)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [liabilityLegId, debtKind, acc.loan_id, acc.credit_card_id, date, amount, amount - interest - fees, interest, fees],
  );
}

export async function getTransaction(db: Db, id: string): Promise<TransactionRow> {
  const { rows } = await db.query<TransactionRow>(`${SELECT_TX} where t.id = $1`, [id]);
  if (!rows[0]) throw new NotFoundError("transaction");
  return rows[0];
}

/**
 * Edits a transaction with optimistic concurrency (`expectedVersion`). Both
 * legs of a transfer change together. The previous values are preserved in
 * audit_logs together with the reason.
 */
export async function updateTransaction(db: Db, input: TransactionUpdate): Promise<void> {
  await setChangeReason(db, input.reason);
  const { rows } = await db.query<{
    id: string;
    type: TransactionType;
    amount_satang: number;
    version: number;
    transfer_group_id: string | null;
    deleted_at: Date | null;
  }>(
    "select id, type, amount_satang, version, transfer_group_id, deleted_at from transactions where id = $1 for update",
    [input.id],
  );
  const tx = rows[0];
  if (!tx) throw new NotFoundError("transaction");
  if (tx.version !== input.expectedVersion) throw new ConcurrencyError("transaction");
  if (tx.deleted_at) throw new UserFacingError("Restore the transaction before editing it.");

  if (tx.transfer_group_id) {
    await db.query("select id from transactions where transfer_group_id = $1 for update", [tx.transfer_group_id]);
    await db.query(
      `update transactions
         set amount_satang = case when amount_satang < 0 then -$2::bigint else $2::bigint end,
             transaction_date = $3, description = $4, notes = $5
       where transfer_group_id = $1`,
      [tx.transfer_group_id, input.amount, input.date, input.description, input.notes],
    );
    if (tx.type === "debt_payment") {
      // Keep the breakdown consistent: the whole payment is principal unless re-entered.
      await db.query(
        `update debt_payments d
           set amount_satang = $2, principal_satang = $2 - d.interest_satang - d.fees_satang, payment_date = $3
         from transactions t
         where d.transaction_id = t.id and t.transfer_group_id = $1`,
        [tx.transfer_group_id, input.amount, input.date],
      );
    }
    return;
  }

  const sign = tx.amount_satang < 0 ? -1 : 1;
  await db.query(
    `update transactions
       set amount_satang = $2, transaction_date = $3, category_id = $4, description = $5, counterparty = $6, notes = $7
     where id = $1`,
    [input.id, sign * input.amount, input.date, input.categoryId, input.description, input.counterparty, input.notes],
  );
}

/** Soft-deletes (with reason) or restores a transaction and, for transfers, its partner leg. */
export async function setTransactionDeleted(
  db: Db,
  input: { id: string; expectedVersion: number; reason: string },
  deleted: boolean,
): Promise<void> {
  await setChangeReason(db, input.reason);
  const { rows } = await db.query<{ version: number; transfer_group_id: string | null; deleted_at: Date | null }>(
    "select version, transfer_group_id, deleted_at from transactions where id = $1 for update",
    [input.id],
  );
  const tx = rows[0];
  if (!tx) throw new NotFoundError("transaction");
  if (tx.version !== input.expectedVersion) throw new ConcurrencyError("transaction");
  if (Boolean(tx.deleted_at) === deleted) return;

  const where = tx.transfer_group_id ? "transfer_group_id = $1" : "id = $1";
  const key = tx.transfer_group_id ?? input.id;
  await db.query(
    deleted
      ? `update transactions set deleted_at = now(), deleted_reason = $2 where ${where}`
      : `update transactions set deleted_at = null, deleted_reason = null where ${where}`,
    deleted ? [key, input.reason] : [key],
  );
  await db.query(
    deleted
      ? `update debt_payments set deleted_at = now(), deleted_reason = $2
         where transaction_id in (select id from transactions where ${where})`
      : `update debt_payments set deleted_at = null, deleted_reason = null
         where transaction_id in (select id from transactions where ${where})`,
    deleted ? [key, input.reason] : [key],
  );
}

export const PAGE_SIZE = 50;

export async function listTransactions(
  db: Db,
  filter: TransactionFilter,
): Promise<{ rows: TransactionRow[]; total: number; sumSatang: number }> {
  const where: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (!filter.includeDeleted) where.push("t.deleted_at is null");
  if (filter.accountId) add("t.account_id = ?", filter.accountId);
  if (filter.categoryId) add("t.category_id = ?", filter.categoryId);
  if (filter.type) add("t.type = ?", filter.type);
  if (filter.from) add("t.transaction_date >= ?", filter.from);
  if (filter.to) add("t.transaction_date <= ?", filter.to);
  if (filter.q) {
    params.push(`%${filter.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    const p = `$${params.length}`;
    where.push(`(t.description ilike ${p} or t.counterparty ilike ${p} or t.notes ilike ${p})`);
  }
  const whereSql = where.length ? `where ${where.join(" and ")}` : "";
  const { rows: agg } = await db.query<{ total: number; sum: number }>(
    `select count(*)::int as total, coalesce(sum(t.amount_satang) filter (where t.deleted_at is null), 0)::bigint as sum
     from transactions t ${whereSql}`,
    params,
  );
  const { rows } = await db.query<TransactionRow>(
    `${SELECT_TX} ${whereSql}
     order by t.transaction_date desc, t.created_at desc, t.id
     limit ${PAGE_SIZE} offset ${(filter.page - 1) * PAGE_SIZE}`,
    params,
  );
  return { rows, total: agg[0]!.total, sumSatang: agg[0]!.sum };
}

export interface AuditEntry {
  id: string;
  table_name: string;
  action: "insert" | "update" | "delete";
  changed_fields: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  reason: string | null;
  changed_at: Date;
}

export async function getRecordHistory(db: Db, table: string, recordId: string): Promise<AuditEntry[]> {
  const { rows } = await db.query<AuditEntry>(
    `select id, table_name, action, changed_fields, old_data, new_data, reason, changed_at
     from audit_logs where table_name = $1 and record_id = $2
     order by changed_at, id`,
    [table, recordId],
  );
  return rows;
}
