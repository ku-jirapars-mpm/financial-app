"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { FormGroup, FormRow, bareControl } from "@/components/ui/form-row";
import { Input, Select, Textarea } from "@/components/ui/input";
import type { ReceivableKind } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { createReceivableAction } from "../../actions";

const KINDS: { value: ReceivableKind; label: string; hint: string }[] = [
  { value: "work", label: "Unpaid work", hint: "Freelance or a job they haven't paid for yet. Counts as income when paid." },
  { value: "loan", label: "Lent money", hint: "Money you lent. It still counts in your net worth; repayments aren't income." },
  { value: "reimbursement", label: "Paid for them", hint: "You covered someone's share. Their payment reduces your spending." },
  { value: "other", label: "Other", hint: "A deposit or anything else you expect back." },
];

export function ReceivableForm({ today, accounts }: { today: string; accounts: { id: string; name: string }[] }) {
  const [kind, setKind] = useState<ReceivableKind>("work");
  const current = KINDS.find((k) => k.value === kind)!;
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 rounded-[10px] bg-muted p-0.5 text-[12px] font-medium">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            onClick={() => setKind(k.value)}
            className={cn("rounded-[8px] px-1 py-1.5", kind === k.value ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {k.label}
          </button>
        ))}
      </div>
      <p className="px-4 text-[13px] text-muted-foreground">{current.hint}</p>

      <ActionForm key={kind} action={createReceivableAction} submitLabel="Save" idempotent fullWidth className="grid gap-5">
        {(s) => (
          <>
            <input type="hidden" name="kind" value={kind} />
            <FormGroup>
              <FormRow label="Who" htmlFor="person" error={s.fieldErrors?.person}>
                <Input id="person" name="person" required maxLength={100} placeholder={kind === "work" ? "Client" : "Name"} className={bareControl} />
              </FormRow>
              <FormRow label="Amount (฿)" htmlFor="amount" error={s.fieldErrors?.amount}>
                <Input id="amount" name="amount" inputMode="decimal" required placeholder="0.00" className={bareControl} />
              </FormRow>
              <FormRow label="For" htmlFor="description" error={s.fieldErrors?.description}>
                <Input
                  id="description"
                  name="description"
                  maxLength={200}
                  placeholder={kind === "work" ? "Logo design, invoice #12…" : "What it was for"}
                  className={bareControl}
                />
              </FormRow>
            </FormGroup>
            <FormGroup>
              <FormRow label={kind === "work" ? "Work done" : "Date"} htmlFor="issuedDate" error={s.fieldErrors?.issuedDate}>
                <Input id="issuedDate" name="issuedDate" type="date" required defaultValue={today} className={bareControl} />
              </FormRow>
              <FormRow label="Due" htmlFor="dueDate" error={s.fieldErrors?.dueDate}>
                <Input id="dueDate" name="dueDate" type="date" className={bareControl} />
              </FormRow>
              {kind === "loan" && (
                <FormRow label="Paid from" htmlFor="fromAccountId" error={s.fieldErrors?.fromAccountId}>
                  <Select id="fromAccountId" name="fromAccountId" defaultValue={accounts[0]?.id ?? ""} className={bareControl} dir="rtl">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                    <option value="">Not from a tracked account</option>
                  </Select>
                </FormRow>
              )}
            </FormGroup>
            <FormGroup>
              <div className="px-4 py-2">
                <Textarea name="notes" maxLength={2000} placeholder="Notes (optional)" className="min-h-14 bg-transparent px-0" />
              </div>
            </FormGroup>
          </>
        )}
      </ActionForm>
    </div>
  );
}
