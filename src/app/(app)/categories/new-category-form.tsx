"use client";
import { ActionForm } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui/input";
import { createCategoryAction } from "../actions";

export function NewCategoryForm() {
  return (
    <ActionForm action={createCategoryAction} submitLabel="Add" className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
      {(s) => (
        <>
          <Field label="Name" htmlFor="name" error={s.fieldErrors?.name}>
            <Input id="name" name="name" required maxLength={60} />
          </Field>
          <Field label="Kind" htmlFor="kind">
            <Select id="kind" name="kind" defaultValue="expense">
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </Select>
          </Field>
        </>
      )}
    </ActionForm>
  );
}
