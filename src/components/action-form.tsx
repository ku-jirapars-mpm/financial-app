"use client";
import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

/**
 * Form wrapper for server actions: shows field/global errors, disables the
 * submit button while pending, and injects a per-render idempotency key so
 * double taps and retries cannot create duplicate records.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
  className,
  variant,
  idempotent = false,
  confirm,
  fullWidth = false,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  children?: React.ReactNode | ((state: ActionState) => React.ReactNode);
  className?: string;
  variant?: "default" | "destructive" | "outline" | "secondary";
  idempotent?: boolean;
  confirm?: string;
  /** Large full-width submit button (primary forms on mobile). */
  fullWidth?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: true });
  const [key] = useState(() => crypto.randomUUID());
  return (
    <form
      action={formAction}
      className={className ?? "grid gap-4"}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {idempotent && <input type="hidden" name="idempotencyKey" value={key} />}
      {typeof children === "function" ? children(state) : children}
      {state.message && <Alert tone={state.ok ? "info" : "error"}>{state.message}</Alert>}
      <div>
        <Button type="submit" variant={variant} disabled={pending} size={fullWidth ? "lg" : "default"} className={fullWidth ? "w-full" : undefined}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
