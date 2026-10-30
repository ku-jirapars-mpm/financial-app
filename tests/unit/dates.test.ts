import { describe, expect, it } from "vitest";
import { addMonths, bangkokDate, isIsoDate, monthEnd, monthRange } from "../../src/lib/dates";

describe("dates (Asia/Bangkok)", () => {
  it("uses the Bangkok calendar day, not UTC", () => {
    expect(bangkokDate(new Date("2026-03-31T17:30:00Z"))).toBe("2026-04-01");
    expect(bangkokDate(new Date("2026-03-31T16:59:59Z"))).toBe("2026-03-31");
  });

  it("handles month arithmetic", () => {
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(monthRange("2025-11-15", "2026-02-01")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("validates ISO dates strictly", () => {
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2026-2-1")).toBe(false);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });
});
