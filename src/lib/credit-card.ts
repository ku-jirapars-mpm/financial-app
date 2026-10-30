import { addDays } from "./dates";

/**
 * Credit card cycle maths (pure, calendar dates in Asia/Bangkok).
 *
 * - Statement day (วันตัดบัตร) S: the statement closes at the end of day S each
 *   month; in short months it closes on the last day.
 * - Due day (วันชำระวันสุดท้าย) D: last day to pay that statement. If D > S it
 *   falls in the same month as the statement, otherwise in the next month.
 */
function dayInMonth(year: number, month0: number, day: number): string {
  const last = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month0, Math.min(day, last))).toISOString().slice(0, 10);
}

function parts(date: string): [number, number] {
  const [y, m] = date.split("-").map(Number) as [number, number];
  return [y, m - 1];
}

/** Statement closing date in the month containing `date`. */
function statementInMonth(date: string, statementDay: number): string {
  const [y, m] = parts(date);
  return dayInMonth(y, m, statementDay);
}

/** Next statement closing on or after `today`. */
export function nextStatementDate(today: string, statementDay: number): string {
  const thisMonth = statementInMonth(today, statementDay);
  if (thisMonth >= today) return thisMonth;
  const [y, m] = parts(today);
  return dayInMonth(y, m + 1, statementDay);
}

/** Most recent statement closing strictly before `today` (today's statement hasn't closed yet). */
export function lastStatementDate(today: string, statementDay: number): string {
  const thisMonth = statementInMonth(today, statementDay);
  if (thisMonth < today) return thisMonth;
  const [y, m] = parts(today);
  return dayInMonth(y, m - 1, statementDay);
}

/** Payment due date for the statement that closed on `statementDate`. */
export function dueDateForStatement(statementDate: string, statementDay: number, dueDay: number): string {
  const [y, m] = parts(statementDate);
  const sameMonth = dayInMonth(y, m, dueDay);
  return dueDay > statementDay && sameMonth > statementDate ? sameMonth : dayInMonth(y, m + 1, dueDay);
}

export interface CardCycle {
  lastStatement: string;
  nextStatement: string;
  /** Due date of the last closed statement — the payment to make now. */
  currentDue: string;
}

export function cardCycle(today: string, statementDay: number, dueDay: number): CardCycle {
  const lastStatement = lastStatementDate(today, statementDay);
  return {
    lastStatement,
    nextStatement: nextStatementDate(today, statementDay),
    currentDue: dueDateForStatement(lastStatement, statementDay, dueDay),
  };
}

/** Minimum payment: rate × amount due, at least the floor, never more than the amount due. */
export function minimumPayment(amountDue: number, rateBps: number, floorSatang: number): number {
  if (amountDue <= 0) return 0;
  return Math.min(amountDue, Math.max(Math.round((amountDue * rateBps) / 10_000), floorSatang));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export { addDays };
