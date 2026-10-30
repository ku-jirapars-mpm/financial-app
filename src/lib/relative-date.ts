import { formatDate } from "./dates";

/** "Today", "Tomorrow", "in 5 days", "3 days overdue", or a date for anything further out. */
export function dueLabel(date: string, today: string): string {
  const days = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";
  if (days < 0) return `${-days} days overdue`;
  if (days <= 14) return `in ${days} days`;
  return formatDate(date);
}

export function frequencyLabel(frequency: "weekly" | "monthly" | "yearly", interval: number): string {
  const unit = { weekly: "week", monthly: "month", yearly: "year" }[frequency];
  if (interval === 1) return { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }[frequency];
  return `Every ${interval} ${unit}s`;
}
