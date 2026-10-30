/**
 * Money representation: all amounts are stored and computed as integer
 * **satang** (1 THB = 100 satang) in PostgreSQL `bigint` columns and JS
 * safe integers. Floating point is only used when formatting for display.
 */
export const SATANG_PER_BAHT = 100;

export function parseSatang(value: string | number | bigint): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(n)) throw new RangeError(`Amount is not an exact integer: ${String(value)}`);
  return n;
}

/** Parses a user-entered baht string ("1,234.5", "-20", "฿99.99") into satang without float rounding. */
export function bahtToSatang(input: string): number {
  const cleaned = input.trim().replace(/[฿,\s]/g, "");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!m) throw new Error(`Invalid amount: "${input}"`);
  const [, sign, whole, frac = ""] = m;
  const satang = parseSatang(BigInt(whole!) * 100n + BigInt(frac.padEnd(2, "0")));
  return sign ? -satang : satang;
}

export function satangToBahtString(satang: number): string {
  const sign = satang < 0 ? "-" : "";
  const abs = Math.abs(satang);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const formatter = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  minimumFractionDigits: 2,
});

export function formatTHB(satang: number): string {
  return formatter.format(satang === 0 ? 0 : satang / SATANG_PER_BAHT); // avoid "-฿0.00"
}

export function sumSatang(values: Iterable<number>): number {
  let total = 0;
  for (const v of values) total += v;
  return parseSatang(total);
}
