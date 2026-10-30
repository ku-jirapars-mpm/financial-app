import { LIQUID_KINDS, type AccountKind } from "./domain";

/**
 * Pure calculation of a financial snapshot from already-fetched inputs.
 * Bump CALCULATION_VERSION whenever the formulas below change; stored
 * snapshots keep the version they were computed with.
 */
export const CALCULATION_VERSION = "2026.10.1";

export const SNAPSHOT_ASSUMPTIONS = {
  currency: "THB; all amounts are integer satang",
  balance_sign: "positive = asset, negative = amount owed",
  cash: "cash + e_wallet account balances",
  bank: "bank account balances (overdrafts are negative)",
  liabilities:
    "credit card + loan + other liability debt (max(0, -balance) per account) + remaining installment obligations",
  installments:
    "remaining = scheduled installment amounts not yet paid as of the snapshot date; assumes unbilled installments are not already included in the card balance",
  monthly_income: "sum of income transactions in the month",
  monthly_expenses: "expense + fee + interest transactions in the month, net of refunds",
  monthly_debt_payments: "debt payments received by liability accounts in the month",
  net_cash_flow: "net change of cash, e-wallet and bank balances from transactions dated in the month",
  net_financial_position: "sum of all account balances minus remaining installment obligations",
  excluded: "accounts whose opening balance date is after the snapshot date",
} as const;

export interface SnapshotAccountInput {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalanceDate: string;
  /** Balance at end of snapshot date (opening + posted, non-deleted transactions up to that date). */
  balanceSatang: number;
}

export interface SnapshotFlowInput {
  accountKind: AccountKind;
  type: string;
  amountSatang: number;
}

export interface SnapshotInputs {
  snapshotDate: string;
  periodStart: string;
  today: string;
  accounts: SnapshotAccountInput[];
  /** Posted, non-deleted transactions dated within [periodStart, snapshotDate]. */
  flows: SnapshotFlowInput[];
  remainingInstallmentsSatang: number;
}

export interface SnapshotValues {
  snapshot_date: string;
  period_start: string;
  period_end: string;
  total_cash_balance_satang: number;
  total_bank_balance_satang: number;
  total_other_assets_satang: number;
  total_outstanding_liabilities_satang: number;
  total_credit_card_debt_satang: number;
  total_loan_debt_satang: number;
  remaining_installment_obligations_satang: number;
  monthly_income_satang: number;
  monthly_expenses_satang: number;
  monthly_debt_payments_satang: number;
  net_cash_flow_satang: number;
  net_financial_position_satang: number;
  calculation_version: string;
  data_basis: "recorded" | "reconstructed_estimate";
  assumptions: typeof SNAPSHOT_ASSUMPTIONS;
  metadata: {
    accounts: { id: string; name: string; kind: AccountKind; balance_satang: number }[];
    excluded_accounts: { id: string; name: string; opening_balance_date: string }[];
    warnings: string[];
    generated_on: string;
  };
}

export function calculateSnapshot(input: SnapshotInputs): SnapshotValues {
  const included = input.accounts.filter((a) => a.openingBalanceDate <= input.snapshotDate);
  const excluded = input.accounts.filter((a) => a.openingBalanceDate > input.snapshotDate);

  let cash = 0;
  let bank = 0;
  let otherAssets = 0;
  let cardDebt = 0;
  let loanDebt = 0;
  let otherDebt = 0;
  let net = 0;
  for (const a of included) {
    const b = a.balanceSatang;
    net += b;
    switch (a.kind) {
      case "cash":
      case "e_wallet":
        cash += b;
        break;
      case "bank":
        bank += b;
        break;
      case "other_asset":
        otherAssets += b;
        break;
      case "credit_card":
        cardDebt += Math.max(0, -b);
        otherAssets += Math.max(0, b);
        break;
      case "loan":
        loanDebt += Math.max(0, -b);
        otherAssets += Math.max(0, b);
        break;
      case "other_liability":
        otherDebt += Math.max(0, -b);
        otherAssets += Math.max(0, b);
        break;
    }
  }

  let income = 0;
  let expenses = 0;
  let debtPayments = 0;
  let netCashFlow = 0;
  for (const f of input.flows) {
    if (f.type === "income") income += f.amountSatang;
    if (f.type === "expense" || f.type === "fee" || f.type === "interest" || f.type === "refund") {
      expenses -= f.amountSatang;
    }
    if (f.type === "debt_payment" && f.amountSatang > 0 && !LIQUID_KINDS.includes(f.accountKind)) {
      debtPayments += f.amountSatang;
    }
    if (LIQUID_KINDS.includes(f.accountKind)) netCashFlow += f.amountSatang;
  }

  const installments = input.remainingInstallmentsSatang;
  const warnings: string[] = [];
  const reconstructed = input.snapshotDate < input.today;
  if (reconstructed) {
    warnings.push(
      "Generated after the snapshot date from recorded transactions. Balances are a reconstruction and may be incomplete.",
    );
  }
  if (excluded.length) {
    warnings.push(`${excluded.length} account(s) opened after this date were excluded.`);
  }
  if (!included.length) warnings.push("No accounts existed on this date.");

  return {
    snapshot_date: input.snapshotDate,
    period_start: input.periodStart,
    period_end: input.snapshotDate,
    total_cash_balance_satang: cash,
    total_bank_balance_satang: bank,
    total_other_assets_satang: otherAssets,
    total_outstanding_liabilities_satang: cardDebt + loanDebt + otherDebt + installments,
    total_credit_card_debt_satang: cardDebt,
    total_loan_debt_satang: loanDebt,
    remaining_installment_obligations_satang: installments,
    monthly_income_satang: income,
    monthly_expenses_satang: expenses,
    monthly_debt_payments_satang: debtPayments,
    net_cash_flow_satang: netCashFlow,
    net_financial_position_satang: net - installments,
    calculation_version: CALCULATION_VERSION,
    data_basis: reconstructed ? "reconstructed_estimate" : "recorded",
    assumptions: SNAPSHOT_ASSUMPTIONS,
    metadata: {
      accounts: included.map((a) => ({ id: a.id, name: a.name, kind: a.kind, balance_satang: a.balanceSatang })),
      excluded_accounts: excluded.map((a) => ({ id: a.id, name: a.name, opening_balance_date: a.openingBalanceDate })),
      warnings,
      generated_on: input.today,
    },
  };
}
