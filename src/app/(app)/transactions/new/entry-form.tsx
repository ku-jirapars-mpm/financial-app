"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Input, Select, Textarea } from "@/components/ui/input";
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
  { value: "fee", label: "Fee" },
  { value: "interest", label: "Interest" },
  { value: "refund", label: "Refund" },
];

/** One label-left / control-right line inside a grouped form section. */
function FormRow({ label, htmlFor, children, error }: { label: string; htmlFor: string; children: React.ReactNode; error?: string[] }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <label htmlFor={htmlFor} className="flex min-h-[50px] items-center gap-3 px-4">
        <span className="w-24 shrink-0 text-[16px]">{label}</span>
        <div className="min-w-0 flex-1 text-right">{children}</div>
      </label>
      {error?.length ? <p className="px-4 pb-2 text-right text-[12px] text-negative">{error.join(" ")}</p> : null}
    </div>
  );
}

const bare = "h-auto w-full appearance-none bg-transparent px-0 text-right text-[16px] text-muted-foreground focus-visible:ring-0";

export function TransactionEntryForm(props: {
  today: string;
  defaultAccountId: string;
  accounts: { id: string; name: string; kind: AccountKind }[];
  categories: { id: string; name: string; kind: "income" | "expense" }[];
}) {
  const [type, setType] = useState<EntryType>("expense");
  const [amountText, setAmountText] = useState("");
  const twoSided = type === "transfer" || type === "debt_payment";
  const categoryKind = type === "income" ? "income" : "expense";
  const fromAccounts = type === "debt_payment" ? props.accounts.filter((a) => !isLiability(a.kind)) : props.accounts;
  const toAccounts = type === "debt_payment" ? props.accounts.filter((a) => isLiability(a.kind)) : props.accounts;
  const moneyIn = type === "income" || type === "refund";

  return (
    <div className="grid gap-5">
      <div className="grid grid-cols-4 rounded-[10px] bg-muted p-0.5 text-[13px] font-medium">
        {PRIMARY.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setType(t.value)}
            className={cn("rounded-[8px] py-1.5", type === t.value ? "bg-card shadow-sm" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ActionForm key={type} action={createTransactionAction} submitLabel="Save" idempotent fullWidth className="grid gap-5">
        {(s) => (
          <>
            <input type="hidden" name="type" value={type} />
            <div className="grid justify-items-center gap-1 py-4">
              <div className="flex items-baseline justify-center gap-1">
                <span className={cn("text-[34px] font-semibold", moneyIn ? "text-positive" : "text-muted-foreground")}>฿</span>
                <input
                  name="amount"
                  inputMode="decimal"
                  placeholder="0"
                  required
                  autoFocus
                  aria-label="Amount (฿)"
                  autoComplete="off"
                  className={cn(
                    "min-w-0 max-w-[80vw] bg-transparent text-left text-[52px] font-bold tracking-tight outline-none placeholder:text-muted-foreground/40",
                    moneyIn && "text-positive",
                  )}
                  value={amountText}
                  onChange={(e) => setAmountText(e.target.value)}
                  // Grow with the typed amount so the ฿ sign stays next to the digits.
                  style={{ fontSize: 52, width: `${Math.max(1, amountText.length) + 0.4}ch` }}
                />
              </div>
              {s.fieldErrors?.amount && <p className="text-[12px] text-negative">{s.fieldErrors.amount.join(" ")}</p>}
              <div className="flex gap-2 pt-1">
                {MORE.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setType(t.value)}
                    className={cn(
                      "rounded-full px-3 py-1 text-[13px]",
                      type === t.value ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl bg-card">
              <FormRow label={twoSided ? "From" : "Account"} htmlFor="accountId" error={s.fieldErrors?.accountId}>
                <Select
                  id="accountId"
                  name="accountId"
                  className={bare}
                  dir="rtl"
                  defaultValue={fromAccounts.some((a) => a.id === props.defaultAccountId) ? props.defaultAccountId : fromAccounts[0]?.id}
                >
                  {fromAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </FormRow>
              {twoSided ? (
                <FormRow label={type === "debt_payment" ? "Pay off" : "To"} htmlFor="toAccountId" error={s.fieldErrors?.toAccountId}>
                  <Select
                    id="toAccountId"
                    name="toAccountId"
                    className={bare}
                    dir="rtl"
                    defaultValue={toAccounts.find((a) => a.id !== props.defaultAccountId)?.id}
                  >
                    {toAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                </FormRow>
              ) : (
                <FormRow label="Category" htmlFor="categoryId">
                  <Select id="categoryId" name="categoryId" defaultValue="" className={bare} dir="rtl">
                    <option value="">None</option>
                    {props.categories
                      .filter((c) => c.kind === categoryKind)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </Select>
                </FormRow>
              )}
              <FormRow label="Date" htmlFor="date" error={s.fieldErrors?.date}>
                <Input id="date" name="date" type="date" defaultValue={props.today} required className={cn(bare, "justify-end")} />
              </FormRow>
            </div>

            {type === "debt_payment" && (
              <div className="grid gap-1.5">
                <div className="overflow-hidden rounded-2xl bg-card">
                  <FormRow label="Interest" htmlFor="interest" error={s.fieldErrors?.interest}>
                    <Input id="interest" name="interest" inputMode="decimal" placeholder="0.00" className={bare} />
                  </FormRow>
                  <FormRow label="Fees" htmlFor="fees" error={s.fieldErrors?.fees}>
                    <Input id="fees" name="fees" inputMode="decimal" placeholder="0.00" className={bare} />
                  </FormRow>
                </div>
                <p className="px-4 text-[12px] text-muted-foreground">Optional — the part of this payment that wasn&apos;t principal.</p>
              </div>
            )}

            <div className="overflow-hidden rounded-2xl bg-card">
              <FormRow label="Note" htmlFor="description" error={s.fieldErrors?.description}>
                <Input id="description" name="description" maxLength={200} placeholder="What was it for?" className={bare} />
              </FormRow>
              {!twoSided && (
                <FormRow label={moneyIn ? "From" : "Paid to"} htmlFor="counterparty">
                  <Input id="counterparty" name="counterparty" maxLength={100} placeholder="Optional" className={bare} />
                </FormRow>
              )}
              <div className="px-4 py-2">
                <Textarea name="notes" maxLength={2000} placeholder="More details (optional)" className="min-h-14 bg-transparent px-0" />
              </div>
            </div>
          </>
        )}
      </ActionForm>
    </div>
  );
}
