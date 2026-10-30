import { describe, expect, it } from "vitest";
import { CALCULATION_VERSION, calculateSnapshot } from "../../src/lib/snapshot-calc";

const base = {
  snapshotDate: "2026-03-31",
  periodStart: "2026-03-01",
  today: "2026-03-31",
  remainingInstallmentsSatang: 0,
  flows: [],
};

describe("calculateSnapshot", () => {
  it("splits balances by kind and keeps the net-position identity", () => {
    const s = calculateSnapshot({
      ...base,
      remainingInstallmentsSatang: 30_000,
      accounts: [
        { id: "1", name: "Cash", kind: "cash", openingBalanceDate: "2026-01-01", balanceSatang: 5_000 },
        { id: "2", name: "Wallet", kind: "e_wallet", openingBalanceDate: "2026-01-01", balanceSatang: 1_000 },
        { id: "3", name: "Bank", kind: "bank", openingBalanceDate: "2026-01-01", balanceSatang: 100_000 },
        { id: "4", name: "Card", kind: "credit_card", openingBalanceDate: "2026-01-01", balanceSatang: -20_000 },
        { id: "5", name: "Overpaid card", kind: "credit_card", openingBalanceDate: "2026-01-01", balanceSatang: 500 },
        { id: "6", name: "Car loan", kind: "loan", openingBalanceDate: "2026-01-01", balanceSatang: -300_000 },
      ],
    });
    expect(s.total_cash_balance_satang).toBe(6_000);
    expect(s.total_bank_balance_satang).toBe(100_000);
    expect(s.total_credit_card_debt_satang).toBe(20_000);
    expect(s.total_loan_debt_satang).toBe(300_000);
    expect(s.total_other_assets_satang).toBe(500);
    expect(s.total_outstanding_liabilities_satang).toBe(350_000);
    expect(s.net_financial_position_satang).toBe(
      s.total_cash_balance_satang + s.total_bank_balance_satang + s.total_other_assets_satang - s.total_outstanding_liabilities_satang,
    );
    expect(s.calculation_version).toBe(CALCULATION_VERSION);
    expect(s.data_basis).toBe("recorded");
  });

  it("computes monthly flows", () => {
    const s = calculateSnapshot({
      ...base,
      accounts: [],
      flows: [
        { accountKind: "bank", type: "income", amountSatang: 50_000 },
        { accountKind: "credit_card", type: "expense", amountSatang: -10_000 },
        { accountKind: "credit_card", type: "refund", amountSatang: 1_000 },
        { accountKind: "bank", type: "fee", amountSatang: -100 },
        { accountKind: "bank", type: "debt_payment", amountSatang: -8_000 },
        { accountKind: "credit_card", type: "debt_payment", amountSatang: 8_000 },
        { accountKind: "bank", type: "transfer", amountSatang: -2_000 },
        { accountKind: "cash", type: "transfer", amountSatang: 2_000 },
      ],
    });
    expect(s.monthly_income_satang).toBe(50_000);
    expect(s.monthly_expenses_satang).toBe(9_100);
    expect(s.monthly_debt_payments_satang).toBe(8_000);
    expect(s.net_cash_flow_satang).toBe(50_000 - 100 - 8_000);
  });

  it("flags back-dated snapshots and excluded accounts", () => {
    const s = calculateSnapshot({
      ...base,
      today: "2026-05-01",
      accounts: [{ id: "x", name: "Later", kind: "bank", openingBalanceDate: "2026-04-01", balanceSatang: 1 }],
    });
    expect(s.data_basis).toBe("reconstructed_estimate");
    expect(s.metadata.excluded_accounts).toHaveLength(1);
    expect(s.total_bank_balance_satang).toBe(0);
    expect(s.metadata.warnings.length).toBe(3);
  });
});
