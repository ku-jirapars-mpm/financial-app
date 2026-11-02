import Link from "next/link";
import { notFound } from "next/navigation";
import { TransactionIcon } from "@/components/category-icon";
import { Money } from "@/components/money";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { bangkokDate, formatDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { or404 } from "@/lib/not-found";
import { dueLabel, frequencyLabel } from "@/lib/relative-date";
import { listAccounts } from "@/lib/server/accounts";
import { listCategories } from "@/lib/server/categories";
import { getSubscription, monthlyEquivalent, subscriptionPayments, type RecurringType } from "@/lib/server/subscriptions";
import { updateSubscriptionAction } from "../actions";
import { ChargeButtons, RecordActualForm } from "./charge-buttons";
import { SubscriptionForm } from "./subscription-form";
import { StateButtons } from "./[id]/state-buttons";

/** Detail page for a subscription (expense) or a recurring income source. */
export async function RecurringDetail({ userId, id, type }: { userId: string; id: string; type: RecurringType }) {
  const income = type === "income";
  const { sub, payments, accounts, categories } = await or404(
    withUserTransaction(userId, async (db) => ({
      sub: await getSubscription(db, id),
      payments: await subscriptionPayments(db, id),
      accounts: await listAccounts(db),
      categories: (await listCategories(db)).filter((c) => c.kind === type),
    })),
  );
  if (sub.type !== type) notFound();
  const today = bangkokDate();
  const total = payments.filter((p) => !p.deleted_at).reduce((s, p) => s + Math.abs(p.amount_satang), 0);
  const stopped = !sub.is_active && sub.end_date !== null;

  return (
    <>
      <div className="grid justify-items-center gap-2 pt-4 text-center">
        <div className="scale-150">
          <TransactionIcon type={type} category={sub.category_name ?? sub.name} />
        </div>
        <h1 className="mt-3 text-[26px] font-bold tracking-tight">{sub.name}</h1>
        <p className="text-[15px] text-muted-foreground">
          <Money satang={sub.amount_satang} className={income ? "text-positive" : "text-foreground"} /> ·{" "}
          {frequencyLabel(sub.frequency, sub.interval_count)}
          {sub.frequency !== "monthly" || sub.interval_count !== 1 ? (
            <>
              {" "}· <Money satang={monthlyEquivalent(sub.amount_satang, sub.frequency, sub.interval_count)} />/mo
            </>
          ) : null}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {sub.is_active ? "Active" : stopped ? `${income ? "Stopped" : "Cancelled"} ${formatDate(sub.end_date!)}` : "Paused"} ·{" "}
          {sub.account_name}
        </p>
      </div>

      {sub.is_active && sub.next_occurrence_date && (
        <Section title={income ? "Next payday" : "Next charge"}>
          <Row
            title={formatDate(sub.next_occurrence_date)}
            subtitle={dueLabel(sub.next_occurrence_date, today)}
            trailing={<ChargeButtons id={sub.id} dueDate={sub.next_occurrence_date} amountSatang={sub.amount_satang} showSkip />}
          />
          <details className="border-t border-border">
            <summary className="cursor-pointer px-4 py-3 text-[15px] text-primary">
              {income ? "Received a different amount?" : "Charged a different amount?"}
            </summary>
            <RecordActualForm
              id={sub.id}
              dueDate={sub.next_occurrence_date}
              amountSatang={sub.amount_satang}
              today={today}
              income={income}
            />
          </details>
        </Section>
      )}

      <Section title={income ? "Received" : "Payments"} action={<Money satang={total} className="text-[13px] text-muted-foreground" />}>
        {payments.length === 0 && <EmptyRow>{income ? "Nothing recorded yet" : "No payments recorded yet"}</EmptyRow>}
        {payments.map((p) => (
          <Row
            key={p.id}
            href={`/transactions/${p.id}`}
            title={<span className={p.deleted_at ? "text-muted-foreground line-through" : undefined}>{formatDate(p.transaction_date)}</span>}
            trailing={<Money satang={p.amount_satang} signed />}
          />
        ))}
      </Section>

      <div className="grid gap-1.5">
        <h2 className="px-4 text-[13px] font-medium uppercase tracking-wide text-muted-foreground">Details</h2>
        <SubscriptionForm
          mode={type}
          action={updateSubscriptionAction}
          submitLabel="Save changes"
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          values={{
            id: sub.id,
            name: sub.name,
            counterparty: sub.counterparty,
            amountSatang: sub.amount_satang,
            accountId: sub.account_id,
            categoryId: !income && sub.category_name?.toLowerCase() === "subscriptions" ? null : sub.category_id,
            frequency: sub.frequency,
            intervalCount: sub.interval_count,
            nextDate: sub.next_occurrence_date ?? today,
          }}
        />
      </div>

      <StateButtons id={sub.id} active={sub.is_active} cancelled={stopped} income={income} />
      <Link href={income ? "/income" : "/subscriptions"} className="px-4 text-[15px] text-primary">
        {income ? "All recurring income" : "All subscriptions"}
      </Link>
    </>
  );
}
