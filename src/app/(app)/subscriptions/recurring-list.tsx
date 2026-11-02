import Link from "next/link";
import { TransactionIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { dueLabel, frequencyLabel } from "@/lib/relative-date";
import { listSubscriptions, monthlyEquivalent, type RecurringType } from "@/lib/server/subscriptions";
import { ChargeButtons } from "./charge-buttons";

const COPY = {
  expense: { title: "Subscriptions", base: "/subscriptions", empty: "No subscriptions yet. Add Netflix, Spotify, iCloud…", inactive: "Paused & cancelled" },
  income: { title: "Recurring income", base: "/income", empty: "No recurring income yet. Add your salary, dividends, interest…", inactive: "Paused & stopped" },
} as const;

/** List of subscriptions (expense) or recurring income, with monthly/yearly totals and one-tap Record. */
export async function RecurringList({ userId, type, showAll }: { userId: string; type: RecurringType; showAll: boolean }) {
  const copy = COPY[type];
  const income = type === "income";
  const items = await withUserTransaction(userId, (db) => listSubscriptions(db, { includeCancelled: true, type }));
  const today = bangkokDate();
  const active = items.filter((s) => s.is_active);
  const inactive = items.filter((s) => !s.is_active);
  const monthly = active.reduce((sum, s) => sum + monthlyEquivalent(s.amount_satang, s.frequency, s.interval_count), 0);
  const icon = (name: string, category: string | null) => <TransactionIcon type={type} category={category ?? name} />;

  return (
    <>
      <PageHeader
        title={copy.title}
        actions={
          <Link href={`${copy.base}/new`} className="text-[17px] text-primary">
            Add
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Per month</p>
          <Money satang={monthly} className={`text-[22px] font-bold ${income ? "text-positive" : ""}`} />
        </div>
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Per year</p>
          <Money satang={monthly * 12} className={`text-[22px] font-bold ${income ? "text-positive" : ""}`} />
        </div>
      </div>

      <Section title={`Active · ${active.length}`}>
        {active.length === 0 && <EmptyRow>{copy.empty}</EmptyRow>}
        {active.map((s) => {
          const due = s.next_occurrence_date !== null && s.next_occurrence_date <= today;
          return (
            <Row
              key={s.id}
              href={due ? undefined : `${copy.base}/${s.id}`}
              leading={icon(s.name, s.category_name)}
              title={due ? <Link href={`${copy.base}/${s.id}`}>{s.name}</Link> : s.name}
              subtitle={`${frequencyLabel(s.frequency, s.interval_count)} · ${s.account_name}`}
              trailing={
                due ? (
                  <ChargeButtons id={s.id} dueDate={s.next_occurrence_date!} amountSatang={s.amount_satang} />
                ) : (
                  <Money satang={s.amount_satang} className={income ? "text-positive" : undefined} />
                )
              }
              trailingSub={
                s.next_occurrence_date ? (
                  <span className={due ? (income ? "text-positive" : "text-negative") : undefined}>
                    {dueLabel(s.next_occurrence_date, today)}
                  </span>
                ) : undefined
              }
            />
          );
        })}
      </Section>

      {inactive.length > 0 &&
        (showAll ? (
          <Section title={copy.inactive}>
            {inactive.map((s) => (
              <Row
                key={s.id}
                href={`${copy.base}/${s.id}`}
                leading={icon(s.name, s.category_name)}
                title={<span className="text-muted-foreground">{s.name}</span>}
                subtitle={s.end_date ? (income ? "Stopped" : "Cancelled") : "Paused"}
                trailing={<Money satang={s.amount_satang} className="text-muted-foreground" />}
              />
            ))}
          </Section>
        ) : (
          <Link href={`${copy.base}?all=1`} className="px-4 text-[15px] text-primary">
            Show {copy.inactive.toLowerCase()} ({inactive.length})
          </Link>
        ))}
    </>
  );
}
