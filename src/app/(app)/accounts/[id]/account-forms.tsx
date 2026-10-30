"use client";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { AccountStatus } from "@/lib/domain";
import { reconcileAction, setAccountStatusAction, updateAccountAction } from "../../actions";

export function EditAccountForm(props: {
  id: string;
  version: number;
  name: string;
  institution: string | null;
  notes: string | null;
}) {
  return (
    <ActionForm action={updateAccountAction} submitLabel="Save details" variant="outline">
      {(s) => (
        <>
          <input type="hidden" name="id" value={props.id} />
          <input type="hidden" name="expectedVersion" value={props.version} />
          <Field label="Name" htmlFor="name" error={s.fieldErrors?.name}>
            <Input id="name" name="name" defaultValue={props.name} required maxLength={100} />
          </Field>
          <Field label="Institution" htmlFor="institution">
            <Input id="institution" name="institution" defaultValue={props.institution ?? ""} maxLength={100} />
          </Field>
          <Field label="Notes" htmlFor="notes">
            <Textarea id="notes" name="notes" defaultValue={props.notes ?? ""} maxLength={2000} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}

export function ReconcileForm({ accountId, today, liability }: { accountId: string; today: string; liability: boolean }) {
  return (
    <ActionForm action={reconcileAction} submitLabel="Record reconciliation" variant="secondary">
      {(s) => (
        <>
          <input type="hidden" name="accountId" value={accountId} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statement date" htmlFor="asOf" error={s.fieldErrors?.asOf}>
              <Input id="asOf" name="asOf" type="date" defaultValue={today} required />
            </Field>
            <Field
              label={liability ? "Statement amount owed (฿)" : "Statement balance (฿)"}
              htmlFor="statementBalance"
              error={s.fieldErrors?.statementBalance}
            >
              <Input id="statementBalance" name="statementBalance" inputMode="decimal" required />
            </Field>
          </div>
          <Field
            label="Reason for any difference"
            htmlFor="reason"
            error={s.fieldErrors?.reason}
            hint="Required if the statement differs from the recorded balance."
          >
            <Input id="reason" name="reason" maxLength={500} placeholder="e.g. unrecorded bank fee" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="createAdjustment" defaultChecked /> Post an adjustment transaction for the difference
          </label>
        </>
      )}
    </ActionForm>
  );
}

export function StatusForm({ id, status }: { id: string; status: AccountStatus }) {
  return (
    <ActionForm
      action={setAccountStatusAction}
      submitLabel="Change status"
      variant="outline"
      confirm="Change this account's status? Transactions and history are kept."
    >
      {(s) => (
        <>
          <input type="hidden" name="id" value={id} />
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={status === "active" ? "archived" : "active"}>
              <option value="active">Active</option>
              <option value="archived">Archived (hidden, no new activity)</option>
              <option value="closed">Closed</option>
            </Select>
          </Field>
          <Field label="Reason" htmlFor="status-reason" error={s.fieldErrors?.reason}>
            <Input id="status-reason" name="reason" required minLength={3} maxLength={500} />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
