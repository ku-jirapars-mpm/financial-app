import type { Db } from "../db";
import { toCsv } from "../csv";
import { satangToBahtString } from "../money";
import { monthlyFlows } from "./reports";

export async function transactionsCsv(db: Db): Promise<string> {
  const { rows } = await db.query(
    `select t.id, t.transaction_date, t.type, a.name as account, c.name as category, t.amount_satang,
            t.description, t.counterparty, t.notes, t.status, t.transfer_group_id,
            t.created_at, t.updated_at, t.deleted_at, t.deleted_reason
     from transactions t join accounts a on a.id = t.account_id left join categories c on c.id = t.category_id
     order by t.transaction_date, t.created_at, t.id`,
  );
  return toCsv(
    ["id", "date", "type", "account", "category", "amount_thb", "amount_satang", "description", "counterparty", "notes",
     "status", "transfer_group_id", "created_at", "updated_at", "deleted_at", "deleted_reason"],
    rows.map((r) => [r.id, r.transaction_date, r.type, r.account, r.category, satangToBahtString(r.amount_satang),
      r.amount_satang, r.description, r.counterparty, r.notes, r.status, r.transfer_group_id, r.created_at, r.updated_at,
      r.deleted_at, r.deleted_reason]),
  );
}

export async function monthlyCsv(db: Db, from: string, to: string): Promise<string> {
  const rows = await monthlyFlows(db, from, to);
  return toCsv(
    ["month", "income_thb", "expenses_thb", "debt_payments_thb", "interest_and_fees_thb", "net_cash_flow_thb", "transactions"],
    rows.map((r) => [r.month, satangToBahtString(r.income_satang), satangToBahtString(r.expenses_satang),
      satangToBahtString(r.debt_payments_satang), satangToBahtString(r.interest_and_fees_satang),
      satangToBahtString(r.net_cash_flow_satang), r.transaction_count]),
  );
}

/** Debts and installment plans with their full payment history. */
export async function debtsJson(db: Db) {
  const q = async (sql: string) => (await db.query(sql)).rows;
  return {
    format: "myfinance-debts",
    exported_at: new Date().toISOString(),
    amounts: "integer satang (1 THB = 100 satang); liability balances are negative",
    liability_accounts: await q(
      `select a.*, b.balance_satang from accounts a join account_balances b on b.account_id = a.id
       where a.kind in ('credit_card', 'loan', 'other_liability') order by a.name`,
    ),
    credit_cards: await q("select * from credit_cards order by created_at"),
    credit_card_statements: await q("select * from credit_card_statements order by statement_date"),
    loans: await q("select * from loans order by start_date"),
    installment_plans: await q("select * from installment_plans order by start_date"),
    installment_payments: await q("select * from installment_payments order by installment_plan_id, sequence_no"),
    debt_payments: await q("select * from debt_payments order by payment_date"),
  };
}
