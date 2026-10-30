"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { satangToBahtString } from "@/lib/money";
import { cn } from "@/lib/utils";
import { recordSubscriptionChargeAction, skipSubscriptionChargeAction } from "../actions";

/** One-tap "Record" (and optional "Skip") for a due subscription charge. */
export function ChargeButtons({
  id,
  dueDate,
  amountSatang,
  showSkip = false,
}: {
  id: string;
  dueDate: string;
  amountSatang: number;
  showSkip?: boolean;
}) {
  const [recordState, record, recording] = useActionState<ActionState, FormData>(recordSubscriptionChargeAction, { ok: true });
  const [skipState, skip, skipping] = useActionState<ActionState, FormData>(skipSubscriptionChargeAction, { ok: true });
  const error = (!recordState.ok && recordState.message) || (!skipState.ok && skipState.message);
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {showSkip && (
          <form action={skip}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="dueDate" value={dueDate} />
            <button disabled={skipping} className="rounded-full bg-muted px-3 py-1 text-[13px] font-medium disabled:opacity-50">
              Skip
            </button>
          </form>
        )}
        <form action={record}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="dueDate" value={dueDate} />
          <input type="hidden" name="date" value={dueDate} />
          <input type="hidden" name="amount" value={satangToBahtString(amountSatang)} />
          <button
            disabled={recording}
            className={cn("rounded-full bg-primary px-3 py-1 text-[13px] font-semibold text-primary-foreground disabled:opacity-50")}
          >
            {recording ? "…" : "Record"}
          </button>
        </form>
      </div>
      {error && <p className="text-[12px] text-negative">{error}</p>}
    </div>
  );
}
