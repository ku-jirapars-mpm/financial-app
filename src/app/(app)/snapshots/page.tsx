import Link from "next/link";
import { TrendLine } from "@/components/charts";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { addMonths, bangkokDate, formatDate, formatDateTime, monthEnd } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listSnapshots } from "@/lib/server/snapshots";
import { DataBasisBadge } from "@/components/data-basis-badge";
import { CreateSnapshotForm, RebuildSnapshotForm } from "./forms";

export const metadata = { title: "Snapshots" };

export default async function SnapshotsPage({ searchParams }: { searchParams: Promise<{ history?: string }> }) {
  const user = await requireUser();
  const showHistory = (await searchParams).history === "1";
  const snapshots = await withUserTransaction(user.id, (db) => listSnapshots(db, { includeSuperseded: showHistory }));
  const today = bangkokDate();
  const current = snapshots.filter((s) => !s.superseded_by);
  const chart = [...current].reverse().map((s) => ({
    label: s.snapshot_date,
    net: s.net_financial_position_satang,
  }));

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Financial snapshots"
        description="Immutable historical observations of your finances. They are not live balances."
      />
      <Card>
        <CardHeader>
          <CardTitle>Take a snapshot</CardTitle>
          <CardDescription>Best practice: take one on the last day of each month.</CardDescription>
        </CardHeader>
        <CardContent>
          <CreateSnapshotForm today={today} lastMonthEnd={monthEnd(addMonths(today, -1))} />
        </CardContent>
      </Card>

      {current.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Net financial position</CardTitle>
            <CardDescription>From stored snapshots. See the table for which points are estimates.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLine data={chart} series={[{ key: "net", name: "Net position", slot: 1 }]} zeroLine />
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Link className="text-sm text-primary" href={showHistory ? "/snapshots" : "/snapshots?history=1"}>
          {showHistory ? "Hide superseded snapshots" : "Show superseded snapshots"}
        </Link>
      </div>

      {snapshots.length === 0 && <p className="text-sm text-muted-foreground">No snapshots yet.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {snapshots.map((s) => (
          <Card key={s.id} className={s.superseded_by ? "opacity-70" : undefined}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>{formatDate(s.snapshot_date)}</CardTitle>
                <div className="flex gap-1">
                  <DataBasisBadge basis={s.data_basis} />
                  {s.source === "rebuild" && <Badge tone="muted">rebuild</Badge>}
                  {s.superseded_by && <Badge tone="negative">superseded</Badge>}
                </div>
              </div>
              <CardDescription>
                Taken {formatDateTime(s.created_at)} · calc v{s.calculation_version}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              {s.metadata.warnings.map((w) => (
                <Alert key={w}>{w}</Alert>
              ))}
              {s.superseded_by && (
                <Alert tone="info">
                  Superseded {s.superseded_at ? formatDateTime(s.superseded_at) : ""}: {s.supersede_reason}
                </Alert>
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <Item label="Cash" v={s.total_cash_balance_satang} />
                <Item label="Bank" v={s.total_bank_balance_satang} />
                <Item label="Credit card debt" v={s.total_credit_card_debt_satang} />
                <Item label="Loan debt" v={s.total_loan_debt_satang} />
                <Item label="Installments remaining" v={s.remaining_installment_obligations_satang} />
                <Item label="Total liabilities" v={s.total_outstanding_liabilities_satang} />
                <Item label="Income (month)" v={s.monthly_income_satang} />
                <Item label="Expenses (month)" v={s.monthly_expenses_satang} />
                <Item label="Debt payments (month)" v={s.monthly_debt_payments_satang} />
                <Item label="Net cash flow (month)" v={s.net_cash_flow_satang} />
                <Item label="Net position" v={s.net_financial_position_satang} strong />
              </dl>
              {!s.superseded_by && (
                <details className="rounded-md border p-3">
                  <summary className="cursor-pointer text-sm">Rebuild…</summary>
                  <div className="mt-3">
                    <RebuildSnapshotForm snapshotId={s.id} />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Item({ label, v, strong }: { label: string; v: number; strong?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${strong ? "font-semibold" : ""}`}>
        <Money satang={v} />
      </dd>
    </>
  );
}
