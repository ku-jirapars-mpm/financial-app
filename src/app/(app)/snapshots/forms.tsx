"use client";
import { ActionForm } from "@/components/action-form";
import { Field, Input } from "@/components/ui/input";
import { createSnapshotAction, rebuildSnapshotAction } from "../actions";

export function CreateSnapshotForm({ today, lastMonthEnd }: { today: string; lastMonthEnd: string }) {
  return (
    <ActionForm action={createSnapshotAction} submitLabel="Take snapshot" className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      {(s) => (
        <Field
          label="Snapshot date (balances at end of day)"
          htmlFor="snapshotDate"
          error={s.fieldErrors?.snapshotDate}
          hint={`Today's date records the current state. Earlier dates (e.g. ${lastMonthEnd}) are reconstructed estimates.`}
        >
          <Input id="snapshotDate" name="snapshotDate" type="date" defaultValue={today} max={today} required />
        </Field>
      )}
    </ActionForm>
  );
}

export function RebuildSnapshotForm({ snapshotId }: { snapshotId: string }) {
  return (
    <ActionForm
      action={rebuildSnapshotAction}
      submitLabel="Rebuild from current records"
      variant="outline"
      confirm="Create a new snapshot from current records? The existing one is kept and marked superseded."
    >
      {(s) => (
        <>
          <input type="hidden" name="snapshotId" value={snapshotId} />
          <Field label="Reason" htmlFor={`reason-${snapshotId}`} error={s.fieldErrors?.reason}>
            <Input id={`reason-${snapshotId}`} name="reason" required minLength={3} maxLength={500} placeholder="e.g. late transactions entered" />
          </Field>
        </>
      )}
    </ActionForm>
  );
}
