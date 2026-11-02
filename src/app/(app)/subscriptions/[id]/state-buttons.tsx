"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/action-state";
import { setSubscriptionStateAction } from "../../actions";

export function StateButtons({ id, active, cancelled, income = false }: { id: string; active: boolean; cancelled: boolean; income?: boolean }) {
  const [state, act, pending] = useActionState<ActionState, FormData>(setSubscriptionStateAction, { ok: true });
  const button = (value: "active" | "paused" | "cancelled", label: string, tone: string, confirm?: string) => (
    <form
      action={act}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="state" value={value} />
      <button disabled={pending} className={`w-full px-4 py-3 text-left text-[16px] active:bg-muted disabled:opacity-50 ${tone}`}>
        {label}
      </button>
    </form>
  );
  return (
    <div className="grid gap-1.5">
      <div className="divide-y divide-border overflow-hidden rounded-2xl bg-card">
        {active ? button("paused", "Pause", "text-primary") : button("active", cancelled ? (income ? "Restart" : "Restart subscription") : "Resume", "text-primary")}
        {!cancelled &&
          button(
            "cancelled",
            income ? "Stop (no longer receiving)" : "Cancel subscription",
            "text-destructive",
            income ? "Mark this income as stopped? Its history is kept." : "Cancel this subscription? Its payment history is kept.",
          )}
      </div>
      {!state.ok && state.message && <p className="px-4 text-[12px] text-negative">{state.message}</p>}
    </div>
  );
}
