/** All user-facing dates use the Asia/Bangkok calendar (UTC+7, no DST). */
export const APP_TIME_ZONE = "Asia/Bangkok";

const ymd = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date (YYYY-MM-DD) in Bangkok for the given instant. */
export function bangkokDate(at: Date = new Date()): string {
  return ymd.format(at);
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEnd(date: string): string {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

/** "YYYY-MM" keys from `from` to `to` inclusive. */
export function monthRange(fromMonth: string, toMonth: string): string[] {
  const out: string[] = [];
  let cur = `${fromMonth.slice(0, 7)}-01`;
  const end = `${toMonth.slice(0, 7)}-01`;
  while (cur <= end && out.length < 600) {
    out.push(cur.slice(0, 7));
    cur = addMonths(cur, 1);
  }
  return out;
}

const displayDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
});
const displayDateTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Formats a calendar date string (no timezone shift). */
export function formatDate(date: string): string {
  return displayDate.format(new Date(`${date}T12:00:00+07:00`));
}

/** Formats an instant in Bangkok time. */
export function formatDateTime(at: Date | string): string {
  return `${displayDateTime.format(typeof at === "string" ? new Date(at) : at)} ICT`;
}

export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: APP_TIME_ZONE, month: "short", year: "numeric" }).format(
    new Date(`${month.slice(0, 7)}-15T12:00:00+07:00`),
  );
}
