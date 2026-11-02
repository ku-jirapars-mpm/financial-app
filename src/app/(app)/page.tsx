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
import { allCardStatuses, type CardStatus } from "@/lib/server/credit-cards";
import { receivableTotals } from "@/lib/server/receivables";
import { usageTone } from "@/components/card-summary";
import { satangToBahtString } from "@/lib/money";
import { listTransactions } from "@/lib/server/transactions";
import { ReceivableIcon, TransactionIcon } from "@/components/category-icon";
import { dueLabel } from "@/lib/relative-date";
import { ChargeButtons } from "./subscriptions/charge-buttons";
import { transactionFilterSchema } from "@/lib/validation";

export default async function Overview() {
  const user = await requireUser();
  const today = bangkokDate();
  const { accounts, month, recent, upcoming, cards, owed } = await withUserTransaction(user.id, async (db) => ({
    owed: await receivableTotals(db, today),
    upcoming: await dueSubscriptions(db, addDays(today, 7)),
    cards: await allCardStatuses(db, today),
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
  // Money already paid out to others (loans etc.) is still yours; unpaid work counts once received.
  const net = assets - debt + owed.lentOutstandingSatang;
  const cardByAccount = new Map(cards.map((c) => [c.details.account_id, c]));
  // Card bills due within a week (or overdue) that still have an amount to pay.
  const cardsDue = cards.filter((c) => (c.dueSatang ?? 0) > 0 && c.daysUntilDue <= 7);
  const spentShare = month.income_satang > 0 ? Math.min(1, month.expenses_satang / month.income_satang) : month.expenses_satang > 0 ? 1 : 0;

  return (
    <>
      <header className="grid gap-1 px-1 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-[15px] font-medium text-muted-foreground">Net worth</span>
          <PrivacyToggle className="-mr-2" />
        </div>
        <Money satang={net} className="text-[40px] font-bold leading-none tracking-tight" />
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-muted-foreground">
          <span>
            Assets <Money satang={assets} className="text-foreground" />
          </span>
          <span>
            Debt <Money satang={debt} className="text-foreground" />
          </span>
          {owed.lentOutstandingSatang > 0 && (
            <span>
              Owed <Money satang={owed.lentOutstandingSatang} className="text-foreground" />
            </span>
          )}
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

      {(upcoming.length > 0 || cardsDue.length > 0) && (
        <Section title="Upcoming" action={<Link href="/subscriptions">Subscriptions</Link>}>
          {cardsDue.map((c) => {
            const overdue = c.daysUntilDue < 0;
            return (
              <Row
                key={c.details.id}
                leading={<AccountIcon kind="credit_card" />}
                title={<Link href={`/accounts/${c.details.account_id}`}>{c.accountName} bill</Link>}
                subtitle={
                  <span className={overdue || c.daysUntilDue <= 2 ? "text-negative" : undefined}>
                    Due {dueLabel(c.dueDate, today).toLowerCase()} · วันชำระ
                  </span>
                }
                trailing={
                  <Link
                    href={`/transactions/new?type=debt_payment&toAccountId=${c.details.account_id}&amount=${satangToBahtString(c.dueSatang!)}`}
                    className="rounded-full bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground"
                  >
                    Pay
                  </Link>
                }
                trailingSub={<Money satang={c.dueSatang!} />}
              />
            );
          })}
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
            subtitle={
              cardByAccount.has(a.id) ? (
                <CardUsage status={cardByAccount.get(a.id)!} />
              ) : (
                ACCOUNT_KIND_LABELS[a.kind]
              )
            }
            trailing={
              <Money
                satang={isLiability(a.kind) ? -a.balance_satang : a.balance_satang}
                className={isLiability(a.kind) && a.balance_satang < 0 ? "text-negative" : undefined}
              />
            }
          />
        ))}
      </Section>

      <Section>
        <Row
          href="/receivables"
          leading={<ReceivableIcon kind="loan" />}
          title="Owed to me"
          subtitle={
            owed.overdueCount > 0 ? (
              <span className="text-negative">{owed.overdueCount} overdue</span>
            ) : owed.workOutstandingSatang > 0 ? (
              <>
                incl. <Money satang={owed.workOutstandingSatang} /> unpaid work
              </>
            ) : (
              "ลูกหนี้"
            )
          }
          trailing={<Money satang={owed.lentOutstandingSatang + owed.workOutstandingSatang} />}
        />
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

function CardUsage({ status }: { status: CardStatus }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full ${usageTone(status.usedShare)}`}
          style={{ width: `${Math.round(status.usedShare * 100)}%` }}
        />
      </span>
      <span>
        {Math.round(status.usedShare * 100)}% of <Money satang={status.details.credit_limit_satang} />
      </span>
    </span>
  );
}
