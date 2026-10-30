import { Money } from "@/components/money";
import { TransactionIcon } from "@/components/category-icon";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { bangkokDate, addDays, formatDate } from "@/lib/dates";
import { TRANSACTION_TYPE_LABELS } from "@/lib/domain";
import type { TransactionRow } from "@/lib/server/transactions";

function dayLabel(date: string, today: string) {
  if (date === today) return "Today";
  if (date === addDays(today, -1)) return "Yesterday";
  return formatDate(date);
}

function TxRow({ t, showAccount }: { t: TransactionRow; showAccount: boolean }) {
  const title = t.description || t.category_name || TRANSACTION_TYPE_LABELS[t.type];
  const parts = [
    t.counterpart_account_name
      ? `${t.amount_satang < 0 ? `${t.account_name} → ${t.counterpart_account_name}` : `${t.counterpart_account_name} → ${t.account_name}`}`
      : showAccount
        ? t.account_name
        : null,
    t.description && t.category_name ? t.category_name : null,
  ].filter(Boolean);
  return (
    <Row
      href={`/transactions/${t.id}`}
      chevron={false}
      leading={<TransactionIcon type={t.type} category={t.category_name} />}
      title={<span className={t.deleted_at ? "text-muted-foreground line-through" : undefined}>{title}</span>}
      subtitle={t.deleted_at ? `Deleted · ${t.deleted_reason}` : parts.join(" · ") || TRANSACTION_TYPE_LABELS[t.type]}
      trailing={<Money satang={t.amount_satang} signed className="font-medium" />}
    />
  );
}

/** Transactions grouped by day, newest first (rows must already be sorted). */
export function TransactionList({ rows, showAccount = true }: { rows: TransactionRow[]; showAccount?: boolean }) {
  if (!rows.length) {
    return (
      <Section>
        <EmptyRow>No transactions yet</EmptyRow>
      </Section>
    );
  }
  const today = bangkokDate();
  const groups: { date: string; rows: TransactionRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last?.date === r.transaction_date) last.rows.push(r);
    else groups.push({ date: r.transaction_date, rows: [r] });
  }
  return (
    <div className="grid gap-5">
      {groups.map((g) => (
        <Section key={g.date} title={dayLabel(g.date, today)}>
          {g.rows.map((t) => (
            <TxRow key={t.id} t={t} showAccount={showAccount} />
          ))}
        </Section>
      ))}
    </div>
  );
}
