import Link from "next/link";
import { ReceivableIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { Alert } from "@/components/ui/card";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { bangkokDate, formatDate, formatDateTime } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { LIQUID_KINDS, RECEIVABLE_KIND_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/domain";
import { or404, uuidOr404 } from "@/lib/not-found";
import { dueLabel } from "@/lib/relative-date";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { listCategories } from "@/lib/server/categories";
import { getReceivable, receivableTransactions } from "@/lib/server/receivables";
import { cn } from "@/lib/utils";
import { EditForm, PaymentForm, WriteOffForm } from "./forms";

export const metadata = { title: "Owed to me" };

export default async function ReceivablePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuidOr404((await params).id);
  const today = bangkokDate();
  const { r, txs, accounts, categories } = await or404(
    withUserTransaction(user.id, async (db) => ({
      r: await getReceivable(db, id),
      txs: await receivableTransactions(db, id),
      accounts: await listAccounts(db),
      categories: (await listCategories(db)).filter((c) => c.kind === "income"),
    })),
  );
  const open = r.status === "open" || r.status === "partial";
  const overdue = open && r.due_date !== null && r.due_date < today;
  const share = r.amount_satang > 0 ? Math.min(1, r.received_satang / r.amount_satang) : 0;

  return (
    <>
      <div className="grid justify-items-center gap-1.5 pt-4 text-center">
        <div className="scale-150">
          <ReceivableIcon kind={r.kind} />
        </div>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight">{r.person}</h1>
        <p className="text-[15px] text-muted-foreground">
          {RECEIVABLE_KIND_LABELS[r.kind]}
          {r.description && ` · ${r.description}`}
        </p>
      </div>

      <div className="grid gap-3 rounded-2xl bg-card p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-muted-foreground">{open ? "Still owed" : r.status === "paid" ? "Paid in full" : "Written off"}</p>
            <Money satang={open ? r.remaining_satang : r.amount_satang} className="text-[28px] font-bold leading-tight" />
          </div>
          <div className="text-right text-[13px] text-muted-foreground">
            <p>
              Received <Money satang={r.received_satang} className="text-foreground" />
            </p>
            <p>
              of <Money satang={r.amount_satang} />
            </p>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className="h-full rounded-full bg-positive" style={{ width: `${Math.round(share * 100)}%` }} />
        </div>
        <p className={cn("text-[13px]", overdue ? "text-negative" : "text-muted-foreground")}>
          {formatDate(r.issued_date)}
          {r.due_date && ` · due ${formatDate(r.due_date)}${open ? ` (${dueLabel(r.due_date, today).toLowerCase()})` : ""}`}
        </p>
      </div>

      {r.written_off_at && (
        <Alert>
          Written off {formatDateTime(r.written_off_at)}: {r.written_off_reason}
        </Alert>
      )}

      {open && (
        <div className="grid gap-1.5">
          <h2 className="px-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">They paid you</h2>
          <PaymentForm
            id={r.id}
            remainingSatang={r.remaining_satang}
            today={today}
            accounts={accounts.filter((a) => LIQUID_KINDS.includes(a.kind)).map((a) => ({ id: a.id, name: a.name }))}
            categories={r.kind === "work" ? categories.map((c) => ({ id: c.id, name: c.name })) : null}
          />
        </div>
      )}

      <Section title="History">
        {txs.length === 0 && <EmptyRow>No money moved yet</EmptyRow>}
        {txs.map((t) => (
          <Row
            key={t.id}
            href={`/transactions/${t.id}`}
            title={<span className={t.deleted_at ? "text-muted-foreground line-through" : undefined}>{TRANSACTION_TYPE_LABELS[t.type as keyof typeof TRANSACTION_TYPE_LABELS] ?? t.type}</span>}
            subtitle={`${formatDate(t.transaction_date)} · ${t.account_name}`}
            trailing={<Money satang={t.amount_satang} signed />}
          />
        ))}
      </Section>

      {r.status !== "paid" && (
        <div className="grid gap-1.5">
          <h2 className="px-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
            {r.written_off_at ? "Reopen" : "Won't be paid?"}
          </h2>
          <WriteOffForm id={r.id} writtenOff={Boolean(r.written_off_at)} />
        </div>
      )}

      <div className="grid gap-1.5">
        <h2 className="px-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Details</h2>
        <EditForm
          id={r.id}
          version={r.version}
          person={r.person}
          description={r.description}
          amountSatang={r.amount_satang}
          dueDate={r.due_date}
          notes={r.notes}
        />
      </div>
      <Link href="/receivables" className="px-4 text-[15px] text-primary">
        Everyone who owes me
      </Link>
    </>
  );
}
