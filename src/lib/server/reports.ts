import type { Db } from "../db";
import { monthRange } from "../dates";
import { LIQUID_KINDS, type AccountKind } from "../domain";

/**
 * Flow reports are computed from recorded transactions (they are sums of
 * events that happened in a period). Balance-type history (closing cash,
 * outstanding debt, net position) comes from stored snapshots instead — see
 * listSnapshots — so we never silently reconstruct past balances.
 */
export interface MonthlyFlowRow {
  month: string; // YYYY-MM
  income_satang: number;
  expenses_satang: number;
  debt_payments_satang: number;
  interest_and_fees_satang: number;
  net_cash_flow_satang: number;
  transaction_count: number;
}

export async function monthlyFlows(db: Db, fromDate: string, toDate: string): Promise<MonthlyFlowRow[]> {
  // Interest & fees = fee/interest charges + interest/fee portions of debt payment breakdowns.
  // (Record a given interest amount one way or the other, not both.)
  const { rows } = await db.query<MonthlyFlowRow>(
    `with tx as (
       select to_char(t.transaction_date, 'YYYY-MM') as month,
              coalesce(sum(t.amount_satang) filter (where t.type = 'income'), 0) as income,
              -coalesce(sum(t.amount_satang) filter (where t.type in ('expense', 'fee', 'interest', 'refund')), 0) as expenses,
              coalesce(sum(t.amount_satang) filter (
                where t.type = 'debt_payment' and t.amount_satang > 0 and a.kind <> all($3::text[])), 0) as debt_payments,
              -coalesce(sum(t.amount_satang) filter (where t.type in ('fee', 'interest')), 0) as charges,
              coalesce(sum(t.amount_satang) filter (where a.kind = any($3::text[])), 0) as net_cash_flow,
              count(*) as n
       from transactions t join accounts a on a.id = t.account_id
       where t.deleted_at is null and t.status = 'posted' and t.transaction_date between $1 and $2
       group by 1
     ), dp as (
       select to_char(d.payment_date, 'YYYY-MM') as month, sum(d.interest_satang + d.fees_satang) as paid
       from debt_payments d
       where d.deleted_at is null and d.payment_date between $1 and $2
       group by 1
     )
     select tx.month,
            tx.income::bigint as income_satang,
            tx.expenses::bigint as expenses_satang,
            tx.debt_payments::bigint as debt_payments_satang,
            (tx.charges + coalesce(dp.paid, 0))::bigint as interest_and_fees_satang,
            tx.net_cash_flow::bigint as net_cash_flow_satang,
            tx.n::int as transaction_count
     from tx left join dp on dp.month = tx.month
     order by tx.month`,
    [fromDate, toDate, LIQUID_KINDS],
  );
  // Fill months without transactions so charts show real gaps as zero activity.
  const byMonth = new Map(rows.map((r) => [r.month, r]));
  return monthRange(fromDate, toDate).map(
    (m) =>
      byMonth.get(m) ?? {
        month: m,
        income_satang: 0,
        expenses_satang: 0,
        debt_payments_satang: 0,
        interest_and_fees_satang: 0,
        net_cash_flow_satang: 0,
        transaction_count: 0,
      },
  );
}

export interface PeriodSummary {
  from: string;
  to: string;
  income_satang: number;
  expenses_satang: number;
  net_cash_flow_satang: number;
  interest_and_fees_satang: number;
  debt_payments_satang: number;
  transaction_count: number;
  expenses_by_category: { category: string; amount_satang: number }[];
}

export async function periodSummary(db: Db, from: string, to: string): Promise<PeriodSummary> {
  const months = await monthlyFlows(db, from, to);
  const sum = (k: keyof MonthlyFlowRow) => months.reduce((acc, m) => acc + (m[k] as number), 0);
  const { rows: cats } = await db.query<{ category: string; amount_satang: number }>(
    `select coalesce(c.name, 'Uncategorised') as category, (-sum(t.amount_satang))::bigint as amount_satang
     from transactions t left join categories c on c.id = t.category_id
     where t.deleted_at is null and t.status = 'posted'
       and t.type in ('expense', 'fee', 'interest', 'refund')
       and t.transaction_date between $1 and $2
     group by 1 order by 2 desc`,
    [from, to],
  );
  return {
    from,
    to,
    income_satang: sum("income_satang"),
    expenses_satang: sum("expenses_satang"),
    net_cash_flow_satang: sum("net_cash_flow_satang"),
    interest_and_fees_satang: sum("interest_and_fees_satang"),
    debt_payments_satang: sum("debt_payments_satang"),
    transaction_count: sum("transaction_count"),
    expenses_by_category: cats,
  };
}

export interface InstallmentMonthRow {
  month: string;
  amount_due_satang: number;
  plan_count: number;
}

/** Scheduled (unpaid) installment obligations grouped by due month. */
export async function installmentObligationsByMonth(db: Db): Promise<InstallmentMonthRow[]> {
  const { rows } = await db.query<InstallmentMonthRow>(
    `select to_char(p.due_date, 'YYYY-MM') as month,
            sum(p.amount_due_satang - p.amount_paid_satang)::bigint as amount_due_satang,
            count(distinct p.installment_plan_id)::int as plan_count
     from installment_payments p join installment_plans pl on pl.id = p.installment_plan_id
     where pl.status = 'active' and p.status in ('scheduled', 'partially_paid')
     group by 1 order by 1`,
  );
  return rows;
}

export interface DebtProgressRow {
  account_id: string;
  name: string;
  kind: AccountKind;
  status: string;
  starting_debt_satang: number;
  current_debt_satang: number;
  principal_repaid_satang: number;
  interest_and_fees_paid_satang: number;
}

/** Repayment progress per liability account, from recorded transactions and debt payments. */
export async function debtProgress(db: Db): Promise<DebtProgressRow[]> {
  const { rows } = await db.query<DebtProgressRow>(
    `select a.id as account_id, a.name, a.kind, a.status,
            greatest(coalesce(l.principal_satang, -a.opening_balance_satang), 0)::bigint as starting_debt_satang,
            greatest(-b.balance_satang, 0)::bigint as current_debt_satang,
            coalesce(dp.principal, 0)::bigint as principal_repaid_satang,
            coalesce(dp.interest_fees, 0)::bigint as interest_and_fees_paid_satang
     from accounts a
     join account_balances b on b.account_id = a.id
     left join loans l on l.account_id = a.id
     left join lateral (
       select sum(d.principal_satang) as principal, sum(d.interest_satang + d.fees_satang) as interest_fees
       from debt_payments d join transactions t on t.id = d.transaction_id
       where t.account_id = a.id and d.deleted_at is null
     ) dp on true
     where a.kind in ('credit_card', 'loan', 'other_liability')
     order by a.status, a.name`,
  );
  return rows;
}
