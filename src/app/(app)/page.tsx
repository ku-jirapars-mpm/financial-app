import Link from "next/link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bangkokDate, formatDate, formatMonth, monthStart } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { ACCOUNT_KIND_LABELS, isLiability } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { monthlyFlows } from "@/lib/server/reports";
import { listSnapshots } from "@/lib/server/snapshots";
import { listTransactions } from "@/lib/server/transactions";
import { transactionFilterSchema } from "@/lib/validation";

export default async function Dashboard() {
  const user = await requireUser();
  const today = bangkokDate();
  const { accounts, month, recent, latestSnapshot } = await withUserTransaction(user.id, async (db) => ({
    accounts: await listAccounts(db),
    month: (await monthlyFlows(db, monthStart(today), today))[0]!,
    recent: (await listTransactions(db, transactionFilterSchema.parse({}))).rows.slice(0, 8),
    latestSnapshot: (await listSnapshots(db))[0] ?? null,
  }));

  const assets = accounts.filter((a) => !isLiability(a.kind)).reduce((s, a) => s + a.balance_satang, 0);
  const debt = accounts.filter((a) => isLiability(a.kind)).reduce((s, a) => s + Math.max(0, -a.balance_satang), 0);
  const net = accounts.reduce((s, a) => s + a.balance_satang, 0);

  return (
    <div className="grid gap-6">
      <PageHeader title="Overview" description={`Current balances from recorded transactions · ${formatDate(today)}`} />

      {accounts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Start by adding your cash, bank, credit card and loan accounts.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/accounts/new">Add your first account</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Net position" value={net} colored />
            <Stat label="Assets" value={assets} />
            <Stat label="Debt owed" value={debt} />
            <Stat label={`Net cash flow · ${formatMonth(today)}`} value={month.net_cash_flow_satang} colored />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>This month</CardTitle>
                <CardDescription>{formatMonth(today)} so far</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <Row label="Income" value={month.income_satang} />
                <Row label="Expenses" value={-month.expenses_satang} />
                <Row label="Debt payments" value={-month.debt_payments_satang} />
                <Row label="Interest & fees" value={-month.interest_and_fees_satang} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Accounts</CardTitle>
                <Link href="/accounts" className="text-sm text-primary">All</Link>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {accounts.map((a) => (
                  <Link key={a.id} href={`/accounts/${a.id}`} className="flex items-center justify-between gap-2 hover:underline">
                    <span className="truncate">
                      {a.name} <span className="text-xs text-muted-foreground">{ACCOUNT_KIND_LABELS[a.kind]}</span>
                    </span>
                    <Money satang={a.balance_satang} colored={a.balance_satang < 0} />
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Recent transactions</CardTitle>
              <Link href="/transactions" className="text-sm text-primary">History</Link>
            </CardHeader>
            <CardContent>
              <TransactionList rows={recent} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest snapshot</CardTitle>
              <CardDescription>
                {latestSnapshot
                  ? `Historical observation as of ${formatDate(latestSnapshot.snapshot_date)} — not a live balance.`
                  : "No snapshots yet. Take one at month end to build your history."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" asChild>
                <Link href="/snapshots">Snapshots</Link>
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, colored }: { label: string; value: number; colored?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <Money satang={value} colored={colored} className="text-lg font-semibold" />
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <Money satang={value} />
    </div>
  );
}
