import { describe, expect, it } from "vitest";
import { cardCycle, dueDateForStatement, lastStatementDate, minimumPayment, nextStatementDate } from "../../src/lib/credit-card";

describe("credit card cycle (วันตัดบัตร / วันชำระ)", () => {
  it("finds the next and last statement dates", () => {
    expect(nextStatementDate("2026-10-30", 25)).toBe("2026-11-25");
    expect(nextStatementDate("2026-10-25", 25)).toBe("2026-10-25"); // closes end of today
    expect(lastStatementDate("2026-10-25", 25)).toBe("2026-09-25");
    expect(lastStatementDate("2026-10-26", 25)).toBe("2026-10-25");
    expect(nextStatementDate("2026-02-10", 31)).toBe("2026-02-28"); // short month
    expect(lastStatementDate("2026-01-05", 20)).toBe("2025-12-20"); // across the year
  });

  it("puts the due date in the right month", () => {
    expect(dueDateForStatement("2026-10-25", 25, 10)).toBe("2026-11-10"); // due day before statement day → next month
    expect(dueDateForStatement("2026-10-05", 5, 25)).toBe("2026-10-25"); // due day after statement day → same month
    expect(dueDateForStatement("2026-01-31", 31, 20)).toBe("2026-02-20");
    expect(dueDateForStatement("2026-12-25", 25, 10)).toBe("2027-01-10");
  });

  it("builds the current cycle", () => {
    expect(cardCycle("2026-10-30", 25, 10)).toEqual({
      lastStatement: "2026-10-25",
      nextStatement: "2026-11-25",
      currentDue: "2026-11-10",
    });
  });

  it("computes the minimum payment", () => {
    expect(minimumPayment(1_289_000, 1000, 30_000)).toBe(128_900);
    expect(minimumPayment(100_000, 1000, 30_000)).toBe(30_000);
    expect(minimumPayment(20_000, 1000, 30_000)).toBe(20_000);
    expect(minimumPayment(0, 1000, 30_000)).toBe(0);
  });
});
