import { z } from "zod";
import { bahtToSatang } from "./money";
import { isIsoDate } from "./dates";
import { ACCOUNT_KINDS, TRANSACTION_TYPES } from "./domain";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const isoDate = z.string().refine(isIsoDate, "Invalid date (YYYY-MM-DD)");
export const uuid = z.uuid();
const optionalUuid = z
  .union([z.uuid(), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));
const optionalDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

/** Baht text → integer satang (exact). */
export const bahtAmount = z.string().transform((v, ctx) => {
  try {
    return bahtToSatang(v);
  } catch {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 1234.56" });
    return z.NEVER;
  }
});
export const positiveBaht = bahtAmount.refine((v) => v > 0, "Amount must be greater than zero");
const reason = z.string().trim().min(3, "Please give a reason (at least 3 characters)").max(500);

export const accountCreateSchema = z.object({
  name: trimmed(100).min(1, "Name is required"),
  kind: z.enum(ACCOUNT_KINDS),
  institution: optionalText(100),
  /** For liabilities this is the amount owed, entered as a positive number. */
  openingBalance: bahtAmount,
  openingBalanceDate: isoDate,
  notes: optionalText(2000),
});
export type AccountCreateInput = z.output<typeof accountCreateSchema>;

export const accountUpdateSchema = z.object({
  id: uuid,
  expectedVersion: z.coerce.number().int().positive(),
  name: trimmed(100).min(1),
  institution: optionalText(100),
  notes: optionalText(2000),
});

export const accountStatusSchema = z.object({
  id: uuid,
  status: z.enum(["active", "archived", "closed"]),
  reason,
});

export const reconcileSchema = z.object({
  accountId: uuid,
  asOf: isoDate,
  /** Balance shown on the bank/card statement. For liabilities: amount owed as a positive number. */
  statementBalance: bahtAmount,
  reason: optionalText(500),
  createAdjustment: z.boolean().default(true),
});

export const categoryCreateSchema = z.object({
  name: trimmed(60).min(1),
  kind: z.enum(["income", "expense"]),
});

export const transactionEntrySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.enum(["income", "expense", "fee", "interest", "refund"]),
    accountId: uuid,
    categoryId: optionalUuid,
    amount: positiveBaht,
    date: isoDate,
    description: trimmed(200).default(""),
    counterparty: optionalText(100),
    notes: optionalText(2000),
    idempotencyKey: z.string().min(8).max(100),
  }),
  z.object({
    type: z.literal("transfer"),
    accountId: uuid,
    toAccountId: uuid,
    amount: positiveBaht,
    date: isoDate,
    description: trimmed(200).default(""),
    notes: optionalText(2000),
    idempotencyKey: z.string().min(8).max(100),
  }),
  z.object({
    type: z.literal("debt_payment"),
    accountId: uuid,
    toAccountId: uuid,
    amount: positiveBaht,
    interest: bahtAmount.optional().default(0).pipe(z.number().int().min(0)),
    fees: bahtAmount.optional().default(0).pipe(z.number().int().min(0)),
    date: isoDate,
    description: trimmed(200).default(""),
    notes: optionalText(2000),
    idempotencyKey: z.string().min(8).max(100),
  }),
]);
export type TransactionEntry = z.output<typeof transactionEntrySchema>;

export const transactionUpdateSchema = z.object({
  id: uuid,
  expectedVersion: z.coerce.number().int().positive(),
  amount: positiveBaht,
  date: isoDate,
  categoryId: optionalUuid,
  description: trimmed(200).default(""),
  counterparty: optionalText(100),
  notes: optionalText(2000),
  reason,
});
export type TransactionUpdate = z.output<typeof transactionUpdateSchema>;

export const transactionDeleteSchema = z.object({
  id: uuid,
  expectedVersion: z.coerce.number().int().positive(),
  reason,
});

export const transactionFilterSchema = z.object({
  accountId: optionalUuid,
  categoryId: optionalUuid,
  type: z
    .union([z.enum(TRANSACTION_TYPES), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  from: optionalDate,
  to: optionalDate,
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => (v ? v : null)),
  includeDeleted: z
    .string()
    .nullish()
    .transform((v) => v === "1" || v === "true"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});
export type TransactionFilter = z.output<typeof transactionFilterSchema>;

export const snapshotCreateSchema = z.object({ snapshotDate: isoDate });
export const snapshotRebuildSchema = z.object({ snapshotId: uuid, reason });

export const periodSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((p) => p.from <= p.to, "Start must be on or before end");
