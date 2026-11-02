import Link from "next/link";
import { ReceivableIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { RECEIVABLE_KIND_LABELS } from "@/lib/domain";
import { dueLabel } from "@/lib/relative-date";
import { requireUser } from "@/lib/session";
import { listReceivables, receivableTotals, type ReceivableRow } from "@/lib/server/receivables";

export const metadata = { title: "Owed to me" };

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const showAll = (await searchParams).all === "1";
  const today = bangkokDate();
  const { rows, totals } = await withUserTransaction(user.id, async (db) => ({
    rows: await listReceivables(db),
    totals: await receivableTotals(db, today),
  }));
  const open = rows.filter((r) => r.status === "open" || r.status === "partial");
  const closed = rows.filter((r) => r.status === "paid" || r.status === "written_off");

  const row = (r: ReceivableRow) => {
    const overdue = r.due_date !== null && r.due_date < today && r.remaining_satang > 0 && !r.written_off_at;
    return (
      <Row
        key={r.id}
        href={`/receivables/${r.id}`}
        leading={<ReceivableIcon kind={r.kind} />}
        title={r.person}
        subtitle={[r.description || RECEIVABLE_KIND_LABELS[r.kind], r.status === "partial" ? "part paid" : null].filter(Boolean).join(" · ")}
        trailing={
          r.status === "written_off" ? (
            <span className="text-muted-foreground">Written off</span>
          ) : r.status === "paid" ? (
            <span className="text-positive">Paid</span>
          ) : (
            <Money satang={r.remaining_satang} className="font-medium" />
          )
        }
        trailingSub={
          r.due_date && r.remaining_satang > 0 && !r.written_off_at ? (
            <span className={overdue ? "text-negative" : undefined}>Due {dueLabel(r.due_date, today).toLowerCase()}</span>
          ) : undefined
        }
      />
    );
  };

  return (
    <>
      <PageHeader
        title="Owed to me"
        description="ลูกหนี้ · money people owe you"
        actions={
          <Link href="/receivables/new" className="text-[17px] text-primary">
            Add
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Lent out</p>
          <Money satang={totals.lentOutstandingSatang} className="text-[22px] font-bold" />
          <p className="text-[11px] text-muted-foreground">counted in net worth</p>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Unpaid work</p>
          <Money satang={totals.workOutstandingSatang} className="text-[22px] font-bold" />
          <p className="text-[11px] text-muted-foreground">counted when paid</p>
        </div>
      </div>
      <Section title={`Open · ${open.length}`} footer={totals.overdueCount ? `${totals.overdueCount} overdue` : undefined}>
        {open.length ? open.map(row) : <EmptyRow>Nobody owes you anything</EmptyRow>}
      </Section>
      {closed.length > 0 &&
        (showAll ? (
          <Section title="Paid & written off">{closed.map(row)}</Section>
        ) : (
          <Link href="/receivables?all=1" className="px-4 text-[15px] text-primary">
            Show paid & written off ({closed.length})
          </Link>
        ))}
    </>
  );
}
