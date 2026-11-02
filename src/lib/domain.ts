export const ACCOUNT_KINDS = [
  "cash",
  "bank",
  "e_wallet",
  "credit_card",
  "loan",
  "other_asset",
  "other_liability",
] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const LIABILITY_KINDS: readonly AccountKind[] = ["credit_card", "loan", "other_liability"];
export const LIQUID_KINDS: readonly AccountKind[] = ["cash", "bank", "e_wallet"];

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  cash: "Cash",
  bank: "Bank account",
  e_wallet: "E-wallet",
  credit_card: "Credit card",
  loan: "Loan",
  other_asset: "Other asset",
  other_liability: "Other liability",
};

export const ACCOUNT_STATUSES = ["active", "archived", "closed"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "transfer",
  "adjustment",
  "debt_payment",
  "fee",
  "interest",
  "refund",
  "lend",
  "collect",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  adjustment: "Adjustment",
  debt_payment: "Debt payment",
  fee: "Fee",
  interest: "Interest",
  refund: "Refund",
  lend: "Lent",
  collect: "Money returned",
};

export const RECEIVABLE_KINDS = ["work", "loan", "reimbursement", "other"] as const;
export type ReceivableKind = (typeof RECEIVABLE_KINDS)[number];

export const RECEIVABLE_KIND_LABELS: Record<ReceivableKind, string> = {
  work: "Unpaid work",
  loan: "Lent money",
  reimbursement: "Reimbursement",
  other: "Other",
};

/** How a payment received for each kind of receivable is recorded. */
export const RECEIVABLE_PAYMENT_TYPE: Record<ReceivableKind, "income" | "collect" | "refund"> = {
  work: "income",
  loan: "collect",
  reimbursement: "refund",
  other: "collect",
};

/** Sign a positive magnitude according to how the type affects the account balance. */
export function signedAmount(type: "income" | "refund" | "expense" | "fee" | "interest", magnitude: number): number {
  if (magnitude <= 0 || !Number.isSafeInteger(magnitude)) throw new RangeError("Amount must be a positive integer");
  return type === "income" || type === "refund" ? magnitude : -magnitude;
}

export function isLiability(kind: AccountKind): boolean {
  return LIABILITY_KINDS.includes(kind);
}

export const DEFAULT_CATEGORIES: { name: string; kind: "income" | "expense" }[] = [
  { name: "Salary", kind: "income" },
  { name: "Bonus", kind: "income" },
  { name: "Interest & dividends", kind: "income" },
  { name: "Other income", kind: "income" },
  { name: "Food & dining", kind: "expense" },
  { name: "Groceries", kind: "expense" },
  { name: "Transport", kind: "expense" },
  { name: "Housing & rent", kind: "expense" },
  { name: "Utilities", kind: "expense" },
  { name: "Phone & internet", kind: "expense" },
  { name: "Health", kind: "expense" },
  { name: "Insurance", kind: "expense" },
  { name: "Shopping", kind: "expense" },
  { name: "Entertainment", kind: "expense" },
  { name: "Subscriptions", kind: "expense" },
  { name: "Education", kind: "expense" },
  { name: "Family", kind: "expense" },
  { name: "Bank fees & interest", kind: "expense" },
  { name: "Other expense", kind: "expense" },
];
