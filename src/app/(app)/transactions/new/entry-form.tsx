"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { isLiability, type AccountKind } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { createTransactionAction } from "../../actions";

type EntryType = "expense" | "income" | "transfer" | "debt_payment" | "fee" | "interest" | "refund";

const PRIMARY: { value: EntryType; label: string }[] = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
  { value: "transfer", label: "Transfer" },
  { value: "debt_payment", label: "Pay debt" },
];
const MORE: { value: EntryType; label: string }[] = [
  { value: "fee", label: "Fee charged" },
  { value: "interest", label: "Interest charged" },
  { value: "refund", label: "Refund received" },
];

export function TransactionEntryForm(props: {
  today: string;
  defaultAccountId: string;
  accounts: { id: string; name: string; kind: AccountKind }[];
  categories: { id: string; name: string; kind: "income" | "expense" }[];
}) {
  const [type, setType] = useState<EntryType>("expense");
  const twoSided = type === "transfer" || type === "debt_payment";
  const categoryKind = type === "income" ? "income" : "expense";
  const fromAccounts = type === "debt_payment" ? props.accounts.filter((a) => !isLiability(a.kind)) : props.accounts;
  const toAccounts = type === "debt_payment" ? props.accounts.filter((a) => isLiability(a.kind)) : props.accounts;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-1 rounded-lg bg-muted p-1 text-sm">
        {PRIMARY.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn("rounded-md py-2", type === t.value ? "bg-card font-medium shadow-sm" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        {MORE.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn("rounded-full border px-3 py-1", type === t.value && "border-primary text-primary")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ActionForm key={type} action={createTransactionAction} submitLabel="Save" idempotent>
        {(s) => (
          <>
            <input type="hidden" name="type" value={type} />
            <Field label="Amount (฿)" htmlFor="amount" error={s.fieldErrors?.amount}>
              <Input id="amount" name="amount" inputMode="decimal" placeholder="0.00" required autoFocus className="text-lg" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={twoSided ? "From account" : "Account"} htmlFor="accountId" error={s.fieldErrors?.accountId}>
                <Select
                  id="accountId"
                  name="accountId"
                  defaultValue={fromAccounts.some((a) => a.id === props.defaultAccountId) ? props.defaultAccountId : fromAccounts[0]?.id}
                >
                  {fromAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
              {twoSided ? (
                <Field label={type === "debt_payment" ? "Debt account" : "To account"} htmlFor="toAccountId" error={s.fieldErrors?.toAccountId}>
                  <Select id="toAccountId" name="toAccountId" defaultValue={toAccounts.find((a) => a.id !== props.defaultAccountId)?.id}>
                    {toAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                </Field>
              ) : (
                <Field label="Category" htmlFor="categoryId" error={s.fieldErrors?.categoryId}>
                  <Select id="categoryId" name="categoryId" defaultValue="">
                    <option value="">Uncategorised</option>
                    {props.categories
                      .filter((c) => c.kind === categoryKind)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </Select>
                </Field>
              )}
            </div>
            {type === "debt_payment" && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="of which interest (฿)" htmlFor="interest" error={s.fieldErrors?.interest} hint="Optional breakdown.">
                  <Input id="interest" name="interest" inputMode="decimal" defaultValue="0" />
                </Field>
                <Field label="of which fees (฿)" htmlFor="fees" error={s.fieldErrors?.fees}>
                  <Input id="fees" name="fees" inputMode="decimal" defaultValue="0" />
                </Field>
              </div>
            )}
            <Field label="Date" htmlFor="date" error={s.fieldErrors?.date}>
              <Input id="date" name="date" type="date" defaultValue={props.today} required />
            </Field>
            <Field label="Description" htmlFor="description" error={s.fieldErrors?.description}>
              <Input id="description" name="description" maxLength={200} />
            </Field>
            {!twoSided && (
              <Field label="Payee / payer (optional)" htmlFor="counterparty">
                <Input id="counterparty" name="counterparty" maxLength={100} />
              </Field>
            )}
            <Field label="Notes (optional)" htmlFor="notes">
              <Textarea id="notes" name="notes" maxLength={2000} />
            </Field>
          </>
        )}
      </ActionForm>
    </div>
  );
}
