import Link from "next/link";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Row, Section } from "@/components/ui/list";
import { formatDate } from "@/lib/dates";
import { dueLabel } from "@/lib/relative-date";
import { satangToBahtString } from "@/lib/money";
import type { CardStatus } from "@/lib/server/credit-cards";
import { cn } from "@/lib/utils";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export function usageTone(share: number) {
  return share >= 0.9 ? "bg-negative" : share >= 0.7 ? "bg-warning" : "bg-primary";
}

/** Limit / used / available, statement day (วันตัดบัตร) and payment due (วันชำระ). */
export function CardSummary({ accountId, status, today }: { accountId: string; status: CardStatus; today: string }) {
  const { details } = status;
  const owing = status.dueSatang !== null && status.dueSatang > 0;
  const overdue = owing && status.daysUntilDue < 0;
  const payHref = `/transactions/new?type=debt_payment&toAccountId=${accountId}${
    owing ? `&amount=${satangToBahtString(status.dueSatang!)}` : ""
  }`;
  return (
    <>
      <div className="grid gap-3 rounded-2xl bg-card p-4">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] text-muted-foreground">Used · ใช้ไป</p>
            <Money satang={status.usedSatang} className="text-[28px] font-bold leading-tight" />
          </div>
          <div className="text-right">
            <p className="text-[13px] text-muted-foreground">Available · คงเหลือ</p>
            <Money
              satang={status.availableSatang}
              className={cn("text-[17px] font-semibold", status.availableSatang < 0 && "text-negative")}
            />
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
          <div className={cn("h-full rounded-full", usageTone(status.usedShare))} style={{ width: `${Math.round(status.usedShare * 100)}%` }} />
        </div>
        <p className="text-[13px] text-muted-foreground">
          {Math.round(status.usedShare * 100)}% of <Money satang={details.credit_limit_satang} /> limit · วงเงิน
        </p>
      </div>

      <Section title="Billing">
        <Row
          title="Statement day · วันตัดบัตร"
          subtitle={`${ordinal(details.statement_day)} of every month`}
          trailing={<span className="text-muted-foreground">{formatDate(status.nextStatement)}</span>}
          trailingSub={dueLabel(status.nextStatement, today)}
        />
        <Row
          title="Payment due · วันชำระ"
          subtitle={`${ordinal(details.due_day)} of the month`}
          trailing={
            <span className={cn(overdue ? "text-negative" : "text-muted-foreground")}>
              {formatDate(owing ? status.dueDate : status.nextDueDate)}
            </span>
          }
          trailingSub={
            <span className={overdue ? "text-negative" : undefined}>
              {dueLabel(owing ? status.dueDate : status.nextDueDate, today)}
            </span>
          }
        />
        {status.dueSatang === null ? (
          <Row title="Amount due" subtitle="Not enough history before the last statement" />
        ) : owing ? (
          <Row
            title={`To pay by ${formatDate(status.dueDate)}`}
            subtitle={
              <>
                Minimum <Money satang={status.minimumSatang ?? 0} />
              </>
            }
            trailing={<Money satang={status.dueSatang!} className={cn("font-semibold", overdue && "text-negative")} />}
          />
        ) : (
          <Row title="Statement paid" subtitle={`Closed ${formatDate(status.lastStatement)}`} trailing={<span className="text-positive">✓</span>} />
        )}
      </Section>
      <p className="-mt-4 px-4 text-[12px] text-muted-foreground">
        Estimated from your records: what you owed when the last statement closed, minus payments since. Check it against
        your bank statement.
      </p>
      <Button size="lg" className="w-full" asChild>
        <Link href={payHref}>Pay card</Link>
      </Button>
    </>
  );
}
