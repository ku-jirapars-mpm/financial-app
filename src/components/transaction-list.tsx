import Link from "next/link";
import { Money } from "@/components/money";
import { Badge } from "@/components/ui/card";
import { formatDate } from "@/lib/dates";
import { TRANSACTION_TYPE_LABELS } from "@/lib/domain";
import type { TransactionRow } from "@/lib/server/transactions";

export function TransactionList({ rows, showAccount = true }: { rows: TransactionRow[]; showAccount?: boolean }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-muted-foreground">No transactions.</p>;
  return (
    <ul className="divide-y">
      {rows.map((t) => (
        <li key={t.id}>
          <Link href={`/transactions/${t.id}`} className="flex items-center justify-between gap-3 py-2.5 hover:bg-muted/50">
            <div className="min-w-0">
              <p className={`truncate text-sm font-medium ${t.deleted_at ? "line-through opacity-60" : ""}`}>
                {t.description || t.category_name || TRANSACTION_TYPE_LABELS[t.type]}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(t.transaction_date)}
                {showAccount && ` · ${t.account_name}`}
                {t.counterpart_account_name && ` ${t.amount_satang < 0 ? "→" : "←"} ${t.counterpart_account_name}`}
                {t.category_name && ` · ${t.category_name}`}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <Money satang={t.amount_satang} colored className="text-sm font-medium" />
              {t.deleted_at ? (
                <Badge tone="negative">deleted</Badge>
              ) : t.type !== "income" && t.type !== "expense" ? (
                <Badge tone="muted">{TRANSACTION_TYPE_LABELS[t.type]}</Badge>
              ) : null}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
