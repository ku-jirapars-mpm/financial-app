import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/lib/canonical-json";
import { toCsv } from "../../src/lib/csv";
import { transactionEntrySchema, transactionFilterSchema } from "../../src/lib/validation";

describe("csv", () => {
  it("quotes and neutralises spreadsheet formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", '=HYPERLINK("evil")'], [-12.5, "+1"]])).toBe(
      'a,b\r\n"x,y","\'=HYPERLINK(""evil"")"\r\n-12.5,\'+1\r\n',
    );
  });
});

describe("canonicalJson", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [2, { x: 2, y: 1 }] }, b: 1 }),
    );
  });
});

describe("validation", () => {
  const id = "4f1c2b8e-8d5e-4f7e-9b1a-2c3d4e5f6a7b";
  it("parses an expense entry with exact satang", () => {
    const r = transactionEntrySchema.parse({
      type: "expense", accountId: id, categoryId: "", amount: "19.99", date: "2026-01-02", idempotencyKey: "abcdefgh12",
    });
    expect(r).toMatchObject({ amount: 1999, categoryId: null, description: "" });
  });

  it("rejects zero/negative amounts, bad dates and bad ids", () => {
    const bad = [
      { amount: "0" }, { amount: "-5" }, { date: "2026-02-30" }, { accountId: "not-a-uuid" },
    ];
    for (const b of bad) {
      expect(
        transactionEntrySchema.safeParse({
          type: "income", accountId: id, amount: "1", date: "2026-01-02", idempotencyKey: "abcdefgh12", ...b,
        }).success,
        JSON.stringify(b),
      ).toBe(false);
    }
  });

  it("parses empty filters from a query string", () => {
    expect(transactionFilterSchema.parse({ accountId: "", type: "", from: "", page: "2" })).toMatchObject({
      accountId: null, type: null, from: null, to: null, q: null, includeDeleted: false, page: 2,
    });
  });
});

describe("debt payment entry", () => {
  it("parses optional interest/fee breakdown as satang", () => {
    const id = "4f1c2b8e-8d5e-4f7e-9b1a-2c3d4e5f6a7b";
    const base = { type: "debt_payment", accountId: id, toAccountId: id, amount: "1000", date: "2026-01-02", idempotencyKey: "abcdefgh12" };
    expect(transactionEntrySchema.parse({ ...base, interest: "12.50" })).toMatchObject({ amount: 100_000, interest: 1_250, fees: 0 });
    expect(transactionEntrySchema.safeParse({ ...base, fees: "-1" }).success).toBe(false);
  });
});

describe("normalizeBaseUrl", () => {
  it("adds https:// when the scheme is missing", async () => {
    const { normalizeBaseUrl } = await import("../../src/lib/auth-config");
    expect(normalizeBaseUrl("financial-app-five-gamma.vercel.app")).toBe("https://financial-app-five-gamma.vercel.app");
    expect(normalizeBaseUrl("https://x.vercel.app/")).toBe("https://x.vercel.app");
    expect(normalizeBaseUrl("http://localhost:3000")).toBe("http://localhost:3000");
    expect(normalizeBaseUrl(" ")).toBeUndefined();
  });
});
