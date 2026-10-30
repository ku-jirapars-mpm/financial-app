import { MonthlyBars, TrendLine, type ChartPoint } from "@/components/charts";
import { DataBasisBadge } from "@/components/data-basis-badge";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { addMonths, bangkokDate, formatDate, formatMonth, monthEnd, monthStart } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  debtProgress,
  installmentObligationsByMonth,
  monthlyFlows,
  periodSummary,
  type PeriodSummary,
} from "@/lib/server/reports";
import { listSnapshots } from "@/lib/server/snapshots";
import { isoDate } from "@/lib/validation";

export const metadata = { title: "Reports" };

type SP = Record<string, string | undefined>;
const date = (v: string | undefined, fallback: string) => (v && isoDate.safeParse(v).success ? v : fallback);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = bangkokDate();
  const from = date(sp.from, monthStart(addMonths(today, -11)));
  const to = date(sp.to, today);
  // Default comparison: last full month vs the month before.
  const aFrom = date(sp.aFrom, monthStart(addMonths(today, -2)));
  const aTo = date(sp.aTo, monthEnd(addMonths(today, -2)));
  const bFrom = date(sp.bFrom, monthStart(addMonths(today, -1)));
  const bTo = date(sp.bTo, monthEnd(addMonths(today, -1)));

  const data = await withUserTransaction(user.id, async (db) => ({
    flows: await monthlyFlows(db, from <= to ? from : to, to),
    snapshots: (await listSnapshots(db)).filter((s) => s.snapshot_date >= from && s.snapshot_date <= to).reverse(),
    installments: await installmentObligationsByMonth(db),
    debts: await debtProgress(db),
    a: await periodSummary(db, aFrom, aTo <= aFrom ? aFrom : aTo),
    b: await periodSummary(db, bFrom, bTo <= bFrom ? bFrom : bTo),
  }));

  const flowChart: ChartPoint[] = data.flows.map((m) => ({
    label: formatMonth(m.month),
    income: m.income_satang,
    expenses: m.expenses_satang,
    net: m.net_cash_flow_satang,
    interest: m.interest_and_fees_satang,
  }));
  const snapChart: ChartPoint[] = data.snapshots.map((s) => ({
    label: s.snapshot_date,
    closingCash: s.total_cash_balance_satang + s.total_bank_balance_satang,
    debt: s.total_outstanding_liabilities_satang,
    net: s.net_financial_position_satang,
  }));
  const estimates = data.snapshots.filter((s) => s.data_basis === "reconstructed_estimate").length;
  const cardNames = [
    ...new Set(data.snapshots.flatMap((s) => s.metadata.accounts.filter((a) => a.kind === "credit_card").map((a) => a.name))),
  ];

  return (
    <div className="grid gap-6">
      <PageHeader title="Reports" />

      <Card>
        <CardContent className="p-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={to} />
            </div>
            <Button type="submit" size="sm">Update</Button>
            <a className="ml-auto text-sm text-primary" href={`/api/export/monthly.csv?from=${from}&to=${to}`}>
              Download monthly CSV
            </a>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly income and expenses</CardTitle>
            <CardDescription>Recorded transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars
              data={flowChart}
              series={[
                { key: "income", name: "Income", slot: 1 },
                { key: "expenses", name: "Expenses", slot: 2 },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly net cash flow</CardTitle>
            <CardDescription>Change in cash, e-wallet and bank balances</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendLine data={flowChart} series={[{ key: "net", name: "Net cash flow", slot: 1 }]} zeroLine />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Interest and fees paid</CardTitle>
            <CardDescription>Fee/interest charges plus interest & fees in debt-payment breakdowns</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyBars data={flowChart} series={[{ key: "interest", name: "Interest & fees", slot: 2 }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Installment obligations by month</CardTitle>
            <CardDescription>Scheduled, unpaid installments</CardDescription>
          </CardHeader>
          <CardContent>
            {data.installments.length ? (
              <MonthlyBars
                data={data.installments.map((r) => ({ label: formatMonth(r.month), due: r.amount_due_satang }))}
                series={[{ key: "due", name: "Due", slot: 3 }]}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No installment plans recorded.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <section className="grid gap-4">
        <h2 className="text-lg font-semibold">Balances over time (from snapshots)</h2>
        {data.snapshots.length < 2 ? (
          <Alert tone="info">
            Take at least two snapshots (e.g. at each month end) to chart closing cash, outstanding debt and net position.
            Past balances are not reconstructed silently from possibly incomplete transaction history.
          </Alert>
        ) : (
          <>
            {estimates > 0 && (
              <Alert>
                {estimates} of {data.snapshots.length} points are <strong>reconstructed estimates</strong> (generated after the
                date from transaction history). Treat them as approximate.
              </Alert>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Closing cash balance</CardTitle>
                  <CardDescription>Cash + e-wallet + bank</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendLine data={snapChart} series={[{ key: "closingCash", name: "Cash & bank", slot: 1 }]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Outstanding debt</CardTitle>
                  <CardDescription>Cards, loans, other liabilities and remaining installments</CardDescription>
                </CardHeader>
                <CardContent>
                  <TrendLine data={snapChart} series={[{ key: "debt", name: "Outstanding debt", slot: 2 }]} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Net financial position</CardTitle>
                </CardHeader>
                <CardContent>
                  <TrendLine data={snapChart} series={[{ key: "net", name: "Net position", slot: 1 }]} zeroLine />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Credit card debt by account</CardTitle>
                  <CardDescription>Per-card balances stored in each snapshot</CardDescription>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  {cardNames.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No credit cards in these snapshots.</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-2">Date</th>
                          {cardNames.map((n) => (
                            <th key={n} className="py-1 pr-2 text-right">{n}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data.snapshots.map((s) => (
                          <tr key={s.id} className="border-t">
                            <td className="py-1 pr-2">{s.snapshot_date}</td>
                            {cardNames.map((n) => {
                              const acc = s.metadata.accounts.find((a) => a.name === n && a.kind === "credit_card");
                              return (
                                <td key={n} className="py-1 pr-2 text-right">
                                  {acc ? <Money satang={Math.max(0, -acc.balance_satang)} /> : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Snapshot table</CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1 pr-2">Date</th>
                      <th className="py-1 pr-2">Basis</th>
                      <th className="py-1 pr-2 text-right">Cash & bank</th>
                      <th className="py-1 pr-2 text-right">Debt</th>
                      <th className="py-1 text-right">Net position</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.snapshots.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="py-1 pr-2">{formatDate(s.snapshot_date)}</td>
                        <td className="py-1 pr-2"><DataBasisBadge basis={s.data_basis} /></td>
                        <td className="py-1 pr-2 text-right"><Money satang={s.total_cash_balance_satang + s.total_bank_balance_satang} /></td>
                        <td className="py-1 pr-2 text-right"><Money satang={s.total_outstanding_liabilities_satang} /></td>
                        <td className="py-1 text-right"><Money satang={s.net_financial_position_satang} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </>
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Debt repayment progress</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {data.debts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No debt accounts.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-2">Account</th>
                  <th className="py-1 pr-2 text-right">Starting debt</th>
                  <th className="py-1 pr-2 text-right">Owed now</th>
                  <th className="py-1 pr-2 text-right">Principal repaid</th>
                  <th className="py-1 text-right">Interest & fees paid</th>
                </tr>
              </thead>
              <tbody>
                {data.debts.map((d) => (
                  <tr key={d.account_id} className="border-t">
                    <td className="py-1 pr-2">{d.name}{d.status !== "active" ? ` (${d.status})` : ""}</td>
                    <td className="py-1 pr-2 text-right"><Money satang={d.starting_debt_satang} /></td>
                    <td className="py-1 pr-2 text-right"><Money satang={d.current_debt_satang} /></td>
                    <td className="py-1 pr-2 text-right"><Money satang={d.principal_repaid_satang} /></td>
                    <td className="py-1 text-right"><Money satang={d.interest_and_fees_paid_satang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Compare two periods</CardTitle>
          <CardDescription>Any two date ranges, from recorded transactions</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form method="get" className="grid grid-cols-2 gap-3 sm:grid-cols-5 sm:items-end">
            <input type="hidden" name="from" value={from} />
            <input type="hidden" name="to" value={to} />
            <div className="grid gap-1.5"><Label htmlFor="aFrom">Period A from</Label><Input id="aFrom" name="aFrom" type="date" defaultValue={aFrom} /></div>
            <div className="grid gap-1.5"><Label htmlFor="aTo">to</Label><Input id="aTo" name="aTo" type="date" defaultValue={aTo} /></div>
            <div className="grid gap-1.5"><Label htmlFor="bFrom">Period B from</Label><Input id="bFrom" name="bFrom" type="date" defaultValue={bFrom} /></div>
            <div className="grid gap-1.5"><Label htmlFor="bTo">to</Label><Input id="bTo" name="bTo" type="date" defaultValue={bTo} /></div>
            <Button type="submit" size="sm">Compare</Button>
          </form>
          <Comparison a={data.a} b={data.b} />
        </CardContent>
      </Card>
    </div>
  );
}

function Comparison({ a, b }: { a: PeriodSummary; b: PeriodSummary }) {
  const rows: [string, keyof PeriodSummary][] = [
    ["Income", "income_satang"],
    ["Expenses", "expenses_satang"],
    ["Net cash flow", "net_cash_flow_satang"],
    ["Debt payments", "debt_payments_satang"],
    ["Interest & fees", "interest_and_fees_satang"],
  ];
  const cats = [...new Set([...a.expenses_by_category, ...b.expenses_by_category].map((c) => c.category))];
  const catAmount = (p: PeriodSummary, c: string) => p.expenses_by_category.find((x) => x.category === c)?.amount_satang ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 pr-2" />
            <th className="py-1 pr-2 text-right">A: {formatDate(a.from)} – {formatDate(a.to)}</th>
            <th className="py-1 pr-2 text-right">B: {formatDate(b.from)} – {formatDate(b.to)}</th>
            <th className="py-1 text-right">B − A</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, k]) => (
            <tr key={k} className="border-t">
              <td className="py-1 pr-2">{label}</td>
              <td className="py-1 pr-2 text-right"><Money satang={a[k] as number} /></td>
              <td className="py-1 pr-2 text-right"><Money satang={b[k] as number} /></td>
              <td className="py-1 text-right"><Money satang={(b[k] as number) - (a[k] as number)} /></td>
            </tr>
          ))}
          {cats.length > 0 && (
            <tr className="border-t">
              <td colSpan={4} className="pt-3 text-xs font-medium text-muted-foreground">Expenses by category</td>
            </tr>
          )}
          {cats.map((c) => (
            <tr key={c} className="border-t">
              <td className="py-1 pr-2">{c}</td>
              <td className="py-1 pr-2 text-right"><Money satang={catAmount(a, c)} /></td>
              <td className="py-1 pr-2 text-right"><Money satang={catAmount(b, c)} /></td>
              <td className="py-1 text-right"><Money satang={catAmount(b, c) - catAmount(a, c)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
