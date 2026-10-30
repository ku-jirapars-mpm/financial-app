"use client";
import { ActionForm } from "@/components/action-form";
import { saveCardDetailsAction } from "../../actions";
import { CardTermsFields } from "../card-terms-fields";

export function CardDetailsForm({
  accountId,
  defaults,
}: {
  accountId: string;
  defaults?: { creditLimit: number; statementDay: number; dueDay: number };
}) {
  return (
    <ActionForm action={saveCardDetailsAction} submitLabel={defaults ? "Save card details" : "Set up card"}>
      {(s) => (
        <>
          <input type="hidden" name="accountId" value={accountId} />
          <CardTermsFields errors={s.fieldErrors} defaults={defaults} />
        </>
      )}
    </ActionForm>
  );
}
