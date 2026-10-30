"use client";
import { useState } from "react";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { ACCOUNT_KINDS, ACCOUNT_KIND_LABELS, isLiability, type AccountKind } from "@/lib/domain";
import { createAccountAction } from "../../actions";
import { CardTermsFields } from "../card-terms-fields";

export function AccountForm({ today }: { today: string }) {
  const [kind, setKind] = useState<AccountKind>("bank");
  return (
    <ActionForm action={createAccountAction} submitLabel="Create account">
      {(s) => (
        <>
          <Field label="Name" htmlFor="name" error={s.fieldErrors?.name}>
            <Input id="name" name="name" required maxLength={100} placeholder="e.g. KBank savings" />
          </Field>
          <Field label="Type" htmlFor="kind" error={s.fieldErrors?.kind}>
            <Select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>{ACCOUNT_KIND_LABELS[k]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Institution (optional)" htmlFor="institution" error={s.fieldErrors?.institution}>
            <Input id="institution" name="institution" maxLength={100} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={isLiability(kind) ? "Amount owed (฿)" : "Opening balance (฿)"}
              htmlFor="openingBalance"
              error={s.fieldErrors?.openingBalance}
              hint={isLiability(kind) ? "Enter what you owe as a positive number." : undefined}
            >
              <Input id="openingBalance" name="openingBalance" inputMode="decimal" defaultValue="0" required />
            </Field>
            <Field
              label="As of date"
              htmlFor="openingBalanceDate"
              error={s.fieldErrors?.openingBalanceDate}
              hint="Transactions before this date can't be added."
            >
              <Input id="openingBalanceDate" name="openingBalanceDate" type="date" defaultValue={today} required />
            </Field>
          </div>
          {kind === "credit_card" && <CardTermsFields errors={s.fieldErrors} />}
          <Field label="Notes (optional)" htmlFor="notes" error={s.fieldErrors?.notes}>
            <Textarea id="notes" name="notes" maxLength={2000} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
