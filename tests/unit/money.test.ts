import { describe, expect, it } from "vitest";
import { bahtToSatang, formatTHB, parseSatang, satangToBahtString } from "../../src/lib/money";

describe("money", () => {
  it("parses baht text exactly into satang", () => {
    expect(bahtToSatang("0.1")).toBe(10);
    expect(bahtToSatang("0.29")).toBe(29); // 0.29 * 100 = 28.999999999999996 in floats
    expect(bahtToSatang("1,234.56")).toBe(123_456);
    expect(bahtToSatang("฿ 99")).toBe(9_900);
    expect(bahtToSatang("-20.5")).toBe(-2_050);
    expect(bahtToSatang("90071992547409.91")).toBe(9_007_199_254_740_991);
  });

  it("rejects ambiguous or unsafe input", () => {
    for (const bad of ["", "abc", "1.234", "1e5", "--1", "90071992547409.92", "1.2.3"]) {
      expect(() => bahtToSatang(bad), bad).toThrow();
    }
    expect(() => parseSatang("1.5")).toThrow();
  });

  it("formats satang", () => {
    expect(satangToBahtString(-105)).toBe("-1.05");
    expect(satangToBahtString(7)).toBe("0.07");
    expect(formatTHB(123_456)).toContain("1,234.56");
    expect(formatTHB(-0)).not.toContain("-");
  });
});
