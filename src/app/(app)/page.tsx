import Link from "next/link";
import { AccountIcon } from "@/components/category-icon";
import { PrivacyToggle } from "@/components/app-shell";
import { Money } from "@/components/money";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { Row, Section } from "@/components/ui/list";
import { addDays, bangkokDate, formatMonth, monthStart } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { ACCOUNT_KIND_LABELS, isLiability } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { monthlyFlows } from "@/lib/server/reports";
import { dueSubscriptions } from "@/lib/server/subscriptions";
import { listTransactions } from "@/lib/server/transactions";
import { TransactionIcon } from "@/components/category-icon";
import { dueLabel } from "@/lib/relative-date";
import { ChargeButtons } from "./subscriptions/charge-buttons";
import { transactionFilterSchema } from "@/lib/validation";

export default async function Overview() {
  const user = await requireUser();
  const today = bangkokDate();
  const { accounts, month, recent, upcoming } = await withUserTransaction(user.id, async (db) => ({
    upcoming: await dueSubscriptions(db, addDays(today, 7)),
    accounts: await listAccounts(db),
    month: (await monthlyFlows(db, monthStart(today), today))[0]!,
    recent: (await listTransactions(db, transactionFilterSchema.parse({}))).rows.slice(0, 6),
  }));

  if (accounts.length === 0) {
    return (
      <div className="grid gap-6 pt-10 text-center">
        <h1 className="text-[28px] font-bold tracking-tight">Welcome to MyFinance</h1>
        <p className="text-[15px] text-muted-foreground">Add your bank, cash and card accounts to get started.</p>
        <Button size="lg" asChild>
          <Link href="/accounts/new">Add an account</Link>
        </Button>
      </div>
    );
  }

  const assets = accounts.filter((a) => !isLiability(a.kind)).reduce((s, a) => s + a.balance_satang, 0);
  const debt = accounts.filter((a) => isLiability(a.kind)).reduce((s, a) => s + Math.max(0, -a.balance_satang), 0);
  const net = assets - debt;
  const spentShare = month.income_satang > 0 ? Math.min(1, month.expenses_satang / month.income_satang) : month.expenses_satang > 0 ? 1 : 0;

  return (
    <>
      <header className="grid gap-1 px-1 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium text-muted-foreground">Net worth</span>
          <PrivacyToggle className="-mr-2" />
        </div>
        <Money satang={net} className="text-[40px] font-bold leading-none tracking-tight" />
        <div className="mt-2 flex gap-4 text-[14px] text-muted-foreground">
          <span>
            Assets <Money satang={assets} className="text-foreground" />
          </span>
          <span>
            Debt <Money satang={debt} className="text-foreground" />
          </span>
        </div>
      </header>

      <Section title={formatMonth(today)}>
        <div className="grid grid-cols-3 divide-x divide-border py-3.5 text-center [&>*]:min-w-0">
          <Stat label="In" satang={month.income_satang} className="text-positive" />
          <Stat label="Out" satang={month.expenses_satang} />
          <Stat label="Net" satang={month.net_cash_flow_satang} signed />
        </div>
        <div className="px-4 pb-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div
              className={`h-full rounded-full ${spentShare >= 1 ? "bg-negative" : "bg-primary"}`}
              style={{ width: `${Math.round(spentShare * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-muted-foreground">
            {month.income_satang > 0 ? `Spent ${Math.round(spentShare * 100)}% of this month's income` : "No income recorded this month"}
          </p>
        </div>
      </Section>

      {upcoming.length > 0 && (
        <Section title="Upcoming charges" action={<Link href="/subscriptions">Subscriptions</Link>}>
          {upcoming.map((s) => {
            const due = s.next_occurrence_date! <= today;
            return (
              <Row
                key={s.id}
                leading={<TransactionIcon type="expense" category={s.name} />}
                title={<Link href={`/subscriptions/${s.id}`}>{s.name}</Link>}
                subtitle={<span className={due ? "text-negative" : undefined}>{dueLabel(s.next_occurrence_date!, today)}</span>}
                trailing={
                  due ? (
                    <ChargeButtons id={s.id} dueDate={s.next_occurrence_date!} amountSatang={s.amount_satang} />
                  ) : (
                    <Money satang={s.amount_satang} />
                  )
                }
                trailingSub={due ? <Money satang={s.amount_satang} /> : s.account_name}
              />
            );
          })}
        </Section>
      )}

      <Section title="Accounts" action={<Link href="/accounts">See all</Link>}>
        {accounts.map((a) => (
          <Row
            key={a.id}
            href={`/accounts/${a.id}`}
            leading={<AccountIcon kind={a.kind} />}
            title={a.name}
            subtitle={ACCOUNT_KIND_LABELS[a.kind]}
            trailing={
              <Money
                satang={isLiability(a.kind) ? -a.balance_satang : a.balance_satang}
                className={isLiability(a.kind) && a.balance_satang < 0 ? "text-negative" : undefined}
              />
            }
          />
        ))}
      </Section>

      <div className="grid gap-1.5">
        <div className="flex items-end justify-between px-4">
          <h2 className="text-[20px] font-bold tracking-tight">Recent</h2>
          <Link href="/transactions" className="text-[15px] text-primary">
            See all
          </Link>
        </div>
        <TransactionList rows={recent} />
      </div>
    </>
  );
}

function Stat({ label, satang, className, signed }: { label: string; satang: number; className?: string; signed?: boolean }) {
  return (
    <div className="grid gap-0.5 px-2">
      <span className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <Money satang={satang} signed={signed} className={`whitespace-nowrap text-[15px] font-semibold ${className ?? ""}`} />
    </div>
  );
}
