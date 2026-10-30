"use client";
import { ActionForm } from "@/components/action-form";
import { FormGroup, FormRow, bareControl } from "@/components/ui/form-row";
import { Input, Select } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import { satangToBahtString } from "@/lib/money";

export interface SubscriptionFormValues {
  id?: string;
  name: string;
  counterparty: string | null;
  amountSatang: number | null;
  accountId: string;
  categoryId: string | null;
  frequency: "weekly" | "monthly" | "yearly";
  intervalCount: number;
  nextDate: string;
}

const PRESETS = ["Netflix", "Spotify", "YouTube Premium", "iCloud+", "Disney+", "ChatGPT", "Apple Music", "LINE MAN"];

export function SubscriptionForm({
  action,
  values,
  accounts,
  categories,
  submitLabel,
}: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  values: SubscriptionFormValues;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  submitLabel: string;
}) {
  return (
    <ActionForm action={action} submitLabel={submitLabel} fullWidth className="grid gap-5">
      {(s) => (
        <>
          {values.id && <input type="hidden" name="id" value={values.id} />}
          <FormGroup>
            <FormRow label="Name" htmlFor="name" error={s.fieldErrors?.name}>
              <Input id="name" name="name" required maxLength={200} defaultValue={values.name} placeholder="Netflix" list="subscription-presets" className={bareControl} />
              <datalist id="subscription-presets">
                {PRESETS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </FormRow>
            <FormRow label="Price (฿)" htmlFor="amount" error={s.fieldErrors?.amount}>
              <Input
                id="amount"
                name="amount"
                inputMode="decimal"
                required
                placeholder="419.00"
                defaultValue={values.amountSatang ? satangToBahtString(values.amountSatang) : ""}
                className={bareControl}
              />
            </FormRow>
            <FormRow label="Every" htmlFor="frequency" error={s.fieldErrors?.frequency}>
              <div className="flex items-center justify-end gap-2">
                <Input
                  name="intervalCount"
                  aria-label="Interval"
                  inputMode="numeric"
                  defaultValue={values.intervalCount}
                  className={`${bareControl} w-10`}
                />
                <Select id="frequency" name="frequency" defaultValue={values.frequency} className={`${bareControl} w-auto`}>
                  <option value="monthly">month(s)</option>
                  <option value="yearly">year(s)</option>
                  <option value="weekly">week(s)</option>
                </Select>
              </div>
            </FormRow>
            <FormRow label="Next charge" htmlFor="nextDate" error={s.fieldErrors?.nextDate}>
              <Input id="nextDate" name="nextDate" type="date" required defaultValue={values.nextDate} className={bareControl} />
            </FormRow>
          </FormGroup>
          <FormGroup footer="Category defaults to “Subscriptions”.">
            <FormRow label="Paid with" htmlFor="accountId" error={s.fieldErrors?.accountId}>
              <Select id="accountId" name="accountId" defaultValue={values.accountId} className={bareControl} dir="rtl">
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </FormRow>
            <FormRow label="Category" htmlFor="categoryId">
              <Select id="categoryId" name="categoryId" defaultValue={values.categoryId ?? ""} className={bareControl} dir="rtl">
                <option value="">Subscriptions</option>
                {categories
                  .filter((c) => c.name.toLowerCase() !== "subscriptions")
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </Select>
            </FormRow>
            <FormRow label="Merchant" htmlFor="counterparty">
              <Input id="counterparty" name="counterparty" maxLength={100} defaultValue={values.counterparty ?? ""} placeholder="Optional" className={bareControl} />
            </FormRow>
          </FormGroup>
        </>
      )}
    </ActionForm>
  );
}
