"use client";
import { ActionForm } from "@/components/action-form";
import { FormGroup, FormRow, bareControl } from "@/components/ui/form-row";
import { Input, Select, Textarea } from "@/components/ui/input";
import { satangToBahtString } from "@/lib/money";
import { recordReceivablePaymentAction, setReceivableWrittenOffAction, updateReceivableAction } from "../../actions";

export function PaymentForm(props: {
  id: string;
  remainingSatang: number;
  today: string;
  accounts: { id: string; name: string }[];
  categories: { id: string; name: string }[] | null;
}) {
  return (
    <ActionForm action={recordReceivablePaymentAction} submitLabel="Record payment" idempotent fullWidth className="grid gap-4">
      {(s) => (
        <>
          <input type="hidden" name="id" value={props.id} />
          <FormGroup>
            <FormRow label="Received (฿)" htmlFor="amount" error={s.fieldErrors?.amount}>
              <Input id="amount" name="amount" inputMode="decimal" required defaultValue={satangToBahtString(props.remainingSatang)} className={bareControl} />
            </FormRow>
            <FormRow label="Date" htmlFor="date" error={s.fieldErrors?.date}>
              <Input id="date" name="date" type="date" required defaultValue={props.today} className={bareControl} />
            </FormRow>
            <FormRow label="Into" htmlFor="accountId" error={s.fieldErrors?.accountId}>
              <Select id="accountId" name="accountId" className={bareControl} dir="rtl">
                {props.accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </FormRow>
            {props.categories && (
              <FormRow label="Category" htmlFor="categoryId">
                <Select id="categoryId" name="categoryId" defaultValue="" className={bareControl} dir="rtl">
                  <option value="">None</option>
                  {props.categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </FormRow>
            )}
          </FormGroup>
        </>
      )}
    </ActionForm>
  );
}

export function EditForm(props: {
  id: string;
  version: number;
  person: string;
  description: string;
  amountSatang: number;
  dueDate: string | null;
  notes: string | null;
}) {
  return (
    <ActionForm action={updateReceivableAction} submitLabel="Save changes" variant="secondary" className="grid gap-4">
      {(s) => (
        <>
          <input type="hidden" name="id" value={props.id} />
          <input type="hidden" name="expectedVersion" value={props.version} />
          <FormGroup>
            <FormRow label="Who" htmlFor="person" error={s.fieldErrors?.person}>
              <Input id="person" name="person" required maxLength={100} defaultValue={props.person} className={bareControl} />
            </FormRow>
            <FormRow label="For" htmlFor="description">
              <Input id="description" name="description" maxLength={200} defaultValue={props.description} className={bareControl} />
            </FormRow>
            <FormRow label="Amount (฿)" htmlFor="editAmount" error={s.fieldErrors?.amount}>
              <Input id="editAmount" name="amount" inputMode="decimal" required defaultValue={satangToBahtString(props.amountSatang)} className={bareControl} />
            </FormRow>
            <FormRow label="Due" htmlFor="dueDate" error={s.fieldErrors?.dueDate}>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={props.dueDate ?? ""} className={bareControl} />
            </FormRow>
          </FormGroup>
          <FormGroup>
            <div className="px-4 py-2">
              <Textarea name="notes" maxLength={2000} defaultValue={props.notes ?? ""} placeholder="Notes" className="min-h-14 bg-transparent px-0" />
            </div>
          </FormGroup>
        </>
      )}
    </ActionForm>
  );
}

export function WriteOffForm({ id, writtenOff }: { id: string; writtenOff: boolean }) {
  return (
    <ActionForm
      action={setReceivableWrittenOffAction}
      submitLabel={writtenOff ? "Reopen" : "Write off"}
      variant={writtenOff ? "secondary" : "destructive"}
      confirm={writtenOff ? undefined : "Write this off? It stops counting in your net worth. History is kept and you can reopen it."}
      className="grid gap-3"
    >
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="writtenOff" value={String(!writtenOff)} />
          <FormGroup>
            <FormRow label="Reason" htmlFor="reason" error={s.fieldErrors?.reason}>
              <Input
                id="reason"
                name="reason"
                required
                minLength={3}
                maxLength={500}
                placeholder={writtenOff ? "Why reopen" : "e.g. won't be paid"}
                className={bareControl}
              />
            </FormRow>
          </FormGroup>
        </>
      )}
    </ActionForm>
  );
}
