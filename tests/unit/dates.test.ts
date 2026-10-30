import { describe, expect, it } from "vitest";
import { addMonths, bangkokDate, isIsoDate, monthEnd, monthRange, nthOccurrence, occurrenceAfter } from "../../src/lib/dates";

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


describe("recurring schedules", () => {
  it("keeps the anchor day for monthly schedules (no drift after short months)", () => {
    expect([1, 2, 3].map((k) => nthOccurrence("2026-01-31", "monthly", 1, k))).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });
  it("finds the next charge strictly after a date", () => {
    expect(occurrenceAfter("2026-01-15", "monthly", 1, "2026-03-15")).toBe("2026-04-15");
    expect(occurrenceAfter("2026-01-15", "monthly", 3, "2026-02-01")).toBe("2026-04-15");
    expect(occurrenceAfter("2024-02-29", "yearly", 1, "2024-02-29")).toBe("2025-02-28");
    expect(occurrenceAfter("2026-10-01", "weekly", 2, "2026-10-01")).toBe("2026-10-15");
  });
});
