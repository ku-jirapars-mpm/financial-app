import Link from "next/link";
import { TransactionIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { dueLabel, frequencyLabel } from "@/lib/relative-date";
import { requireUser } from "@/lib/session";
import { listSubscriptions, monthlyEquivalent } from "@/lib/server/subscriptions";
import { ChargeButtons } from "./charge-buttons";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const showAll = (await searchParams).all === "1";
  const subs = await withUserTransaction(user.id, (db) => listSubscriptions(db, { includeCancelled: true }));
  const today = bangkokDate();
  const active = subs.filter((s) => s.is_active);
  const inactive = subs.filter((s) => !s.is_active);
  const monthly = active.reduce((sum, s) => sum + monthlyEquivalent(s.amount_satang, s.frequency, s.interval_count), 0);

  return (
    <>
      <PageHeader
        title="Subscriptions"
        actions={
          <Link href="/subscriptions/new" className="text-[17px] text-primary">
            Add
          </Link>
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Per month</p>
          <Money satang={monthly} className="text-[22px] font-bold" />
        </div>
        <div className="rounded-2xl bg-card p-4">
          <p className="text-[13px] text-muted-foreground">Per year</p>
          <Money satang={monthly * 12} className="text-[22px] font-bold" />
        </div>
      </div>

      <Section title={`Active · ${active.length}`}>
        {active.length === 0 && <EmptyRow>No subscriptions yet. Add Netflix, Spotify, iCloud…</EmptyRow>}
        {active.map((s) => {
          const due = s.next_occurrence_date && s.next_occurrence_date <= today;
          return (
            <Row
              key={s.id}
              href={due ? undefined : `/subscriptions/${s.id}`}
              leading={<TransactionIcon type="expense" category={s.name} />}
              title={due ? <Link href={`/subscriptions/${s.id}`}>{s.name}</Link> : s.name}
              subtitle={`${frequencyLabel(s.frequency, s.interval_count)} · ${s.account_name}`}
              trailing={
                due ? (
                  <ChargeButtons id={s.id} dueDate={s.next_occurrence_date!} amountSatang={s.amount_satang} />
                ) : (
                  <Money satang={s.amount_satang} />
                )
              }
              trailingSub={
                s.next_occurrence_date ? (
                  <span className={due ? "text-negative" : undefined}>{dueLabel(s.next_occurrence_date, today)}</span>
                ) : undefined
              }
            />
          );
        })}
      </Section>

      {inactive.length > 0 && (
        <>
          {showAll ? (
            <Section title="Paused & cancelled">
              {inactive.map((s) => (
                <Row
                  key={s.id}
                  href={`/subscriptions/${s.id}`}
                  leading={<TransactionIcon type="expense" category={s.name} />}
                  title={<span className="text-muted-foreground">{s.name}</span>}
                  subtitle={s.end_date ? `Cancelled` : "Paused"}
                  trailing={<Money satang={s.amount_satang} className="text-muted-foreground" />}
                />
              ))}
            </Section>
          ) : (
            <Link href="/subscriptions?all=1" className="px-4 text-[15px] text-primary">
              Show paused & cancelled ({inactive.length})
            </Link>
          )}
        </>
      )}
    </>
  );
}
