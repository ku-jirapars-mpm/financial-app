"use client";
import { Money } from "@/components/money";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/** Small segmented switch: show cards as "Available" credit or "Owed". */
export function CardViewToggle({ className }: { className?: string }) {
  const { cardView, setCardView } = useUiStore();
  return (
    <div role="radiogroup" aria-label="Show credit cards as" className={cn("flex rounded-full bg-muted p-0.5 text-[12px] font-semibold", className)}>
      {(
        [
          ["available", "Available"],
          ["owed", "Owed"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={cardView === value}
          onClick={() => setCardView(value)}
          className={cn(
            "rounded-full px-2.5 py-0.5 transition-colors",
            cardView === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function tone(share: number) {
  return share >= 0.9 ? "bg-negative" : share >= 0.7 ? "bg-warning" : "bg-primary";
}

/** Trailing amount for a credit card row. Without a limit, it can only show what's owed. */
export function CardAmount({ owedSatang, limitSatang }: { owedSatang: number; limitSatang: number | null }) {
  const view = useUiStore((s) => s.cardView);
  if (view === "available" && limitSatang !== null) {
    const available = limitSatang - owedSatang;
    return <Money satang={available} className={available < 0 ? "text-negative" : undefined} />;
  }
  return <Money satang={owedSatang} className={owedSatang > 0 ? "text-negative" : undefined} />;
}

/** Subtitle with a usage bar: "฿35,010 left of ฿50,000" or "30% of ฿50,000 used". */
export function CardUsageLine({ owedSatang, limitSatang }: { owedSatang: number; limitSatang: number }) {
  const view = useUiStore((s) => s.cardView);
  const share = limitSatang > 0 ? Math.min(1, Math.max(0, owedSatang / limitSatang)) : 0;
  const available = view === "available";
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-10 shrink-0 overflow-hidden rounded-full bg-muted">
        {/* Available view fills with what's left; owed view fills with what's used. */}
        <span
          className={cn("block h-full rounded-full", available ? "bg-positive" : tone(share))}
          style={{ width: `${Math.round((available ? 1 - share : share) * 100)}%` }}
        />
      </span>
      <span className="truncate">
        {available ? (
          <>
            left of <Money satang={limitSatang} whole />
          </>
        ) : (
          <>
            {Math.round(share * 100)}% of <Money satang={limitSatang} whole /> used
          </>
        )}
      </span>
    </span>
  );
}

/** Overview header figure: total debt, or total credit still available on cards. */
export function DebtOrCredit({ debtSatang, creditLeftSatang }: { debtSatang: number; creditLeftSatang: number | null }) {
  const view = useUiStore((s) => s.cardView);
  if (view === "available" && creditLeftSatang !== null) {
    return (
      <span>
        Credit left <Money satang={creditLeftSatang} className="text-foreground" />
      </span>
    );
  }
  return (
    <span>
      Debt <Money satang={debtSatang} className="text-foreground" />
    </span>
  );
}
