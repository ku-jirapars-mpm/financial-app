"use client";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { satangToBahtString } from "@/lib/money";
import { deleteTransactionAction, updateTransactionAction } from "../../actions";

export function EditTransactionForm(props: {
  id: string;
  version: number;
  amountSatang: number;
  date: string;
  categoryId: string | null;
  description: string;
  counterparty: string | null;
  notes: string | null;
  isTransfer: boolean;
  categories: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={updateTransactionAction} submitLabel="Save changes">
      {(s) => (
        <>
          <input type="hidden" name="id" value={props.id} />
          <input type="hidden" name="expectedVersion" value={props.version} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (฿)" htmlFor="amount" error={s.fieldErrors?.amount}>
              <Input id="amount" name="amount" inputMode="decimal" defaultValue={satangToBahtString(Math.abs(props.amountSatang))} required />
            </Field>
            <Field label="Date" htmlFor="date" error={s.fieldErrors?.date}>
              <Input id="date" name="date" type="date" defaultValue={props.date} required />
            </Field>
          </div>
          {!props.isTransfer && (
            <Field label="Category" htmlFor="categoryId">
              <Select id="categoryId" name="categoryId" defaultValue={props.categoryId ?? ""}>
                <option value="">Uncategorised</option>
                {props.categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Description" htmlFor="description">
            <Input id="description" name="description" defaultValue={props.description} maxLength={200} />
          </Field>
          {!props.isTransfer && (
            <Field label="Payee / payer" htmlFor="counterparty">
              <Input id="counterparty" name="counterparty" defaultValue={props.counterparty ?? ""} maxLength={100} />
            </Field>
          )}
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={props.notes ?? ""} maxLength={2000} />
          </Field>
          <Field label="Reason for this correction" htmlFor="reason" error={s.fieldErrors?.reason}>
            <Input id="reason" name="reason" required minLength={3} maxLength={500} placeholder="e.g. wrong amount on receipt" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function DeleteTransactionForm({ id, version, deleted }: { id: string; version: number; deleted: boolean }) {
  return (
    <ActionForm
      action={deleteTransactionAction}
      submitLabel={deleted ? "Restore transaction" : "Delete transaction"}
      variant={deleted ? "secondary" : "destructive"}
      confirm={deleted ? undefined : "Delete this transaction? It stays in your history and can be restored."}
    >
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="expectedVersion" value={version} />
          {deleted && <input type="hidden" name="restore" value="1" />}
          <Field label="Reason" htmlFor="delete-reason" error={s.fieldErrors?.reason}>
            <Input id="delete-reason" name="reason" required minLength={3} maxLength={500} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
