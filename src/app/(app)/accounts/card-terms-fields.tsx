import { Field, Input } from "@/components/ui/input";
import { satangToBahtString } from "@/lib/money";

/** Credit limit, statement day (วันตัดบัตร) and payment due day (วันชำระวันสุดท้าย). */
export function CardTermsFields({
  errors,
  defaults,
}: {
  errors?: Record<string, string[] | undefined>;
  defaults?: { creditLimit: number; statementDay: number; dueDay: number };
}) {
  return (
    <div className="grid gap-4 rounded-xl bg-input/60 p-3">
      <Field label="Credit limit (฿) · วงเงิน" htmlFor="creditLimit" error={errors?.creditLimit}>
        <Input
          id="creditLimit"
          name="creditLimit"
          inputMode="decimal"
          required
          placeholder="50,000"
          defaultValue={defaults ? satangToBahtString(defaults.creditLimit) : ""}
          className="bg-card"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Statement day · วันตัดบัตร" htmlFor="statementDay" error={errors?.statementDay} hint="Day of month, 1–31">
          <Input
            id="statementDay"
            name="statementDay"
            inputMode="numeric"
            required
            placeholder="25"
            defaultValue={defaults?.statementDay}
            className="bg-card"
          />
        </Field>
        <Field label="Due day · วันชำระ" htmlFor="dueDay" error={errors?.dueDay} hint="Last day to pay">
          <Input id="dueDay" name="dueDay" inputMode="numeric" required placeholder="10" defaultValue={defaults?.dueDay} className="bg-card" />
        </Field>
      </div>
    </div>
  );
}
