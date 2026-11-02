"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { withUserTransaction, type Db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import {
  createAccount,
  reconcileAccount,
  setAccountStatus,
  updateAccountDetails,
} from "@/lib/server/accounts";
import { createCategory, setCategoryArchived } from "@/lib/server/categories";
import { saveCardDetails } from "@/lib/server/credit-cards";
import {
  createReceivable,
  recordReceivablePayment,
  setReceivableWrittenOff,
  updateReceivable,
} from "@/lib/server/receivables";
import { toUserMessage } from "@/lib/server/errors";
import { createSnapshot, rebuildSnapshot } from "@/lib/server/snapshots";
import {
  createSubscription,
  recordSubscriptionCharge,
  setSubscriptionState,
  skipSubscriptionCharge,
  updateSubscription,
} from "@/lib/server/subscriptions";
import { createTransaction, setTransactionDeleted, updateTransaction } from "@/lib/server/transactions";
import { bangkokDate } from "@/lib/dates";
import {
  accountCreateSchema,
  cardDetailsSchema,
  cardDetailsUpdateSchema,
  receivableCreateSchema,
  receivablePaymentSchema,
  receivableUpdateSchema,
  receivableWriteOffSchema,
  accountStatusSchema,
  accountUpdateSchema,
  categoryCreateSchema,
  reconcileSchema,
  snapshotCreateSchema,
  snapshotRebuildSchema,
  subscriptionChargeSchema,
  subscriptionSchema,
  transactionDeleteSchema,
  transactionEntrySchema,
  transactionUpdateSchema,
  uuid,
} from "@/lib/validation";

function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}

/**
 * Validates input, authenticates, then runs `fn` in one RLS-scoped database
 * transaction. Errors are logged without any financial values.
 */
async function run<S extends z.ZodType>(
  schema: S,
  fd: FormData | Record<string, unknown>,
  fn: (db: Db, input: z.output<S>) => Promise<unknown>,
  opts: { name: string; reason?: (input: z.output<S>) => string | null; transform?: (raw: Record<string, unknown>) => unknown } = {
    name: "action",
  },
): Promise<ActionState & { result?: unknown }> {
  const user = await requireUser();
  const raw = fd instanceof FormData ? formObject(fd) : fd;
  const parsed = schema.safeParse(opts.transform ? opts.transform(raw) : raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error as z.ZodError).fieldErrors as Record<string, string[]>,
    };
  }
  try {
    const result = await withUserTransaction(user.id, (db) => fn(db, parsed.data), {
      reason: opts.reason?.(parsed.data) ?? null,
    });
    return { ok: true, result };
  } catch (err) {
    const e = err as { code?: string; name?: string };
    console.error(`[${opts.name}] failed`, { code: e?.code, type: e?.name });
    return { ok: false, message: toUserMessage(err) };
  }
}

// ---------------------------------------------------------------- accounts

export async function createAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const isCard = fd.get("kind") === "credit_card";
  const card = isCard ? cardDetailsSchema.safeParse(Object.fromEntries(fd)) : null;
  if (card && !card.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(card.error).fieldErrors as Record<string, string[]>,
    };
  }
  const r = await run(
    accountCreateSchema,
    fd,
    async (db, input) => {
      // Account and card terms are created in the same database transaction.
      const id = await createAccount(db, input);
      if (card?.success) await saveCardDetails(db, id, card.data);
      return id;
    },
    { name: "createAccount" },
  );
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect(`/accounts/${r.result as string}`);
}

export async function updateAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(accountUpdateSchema, fd, (db, input) => updateAccountDetails(db, input), {
    name: "updateAccount",
    reason: () => "account details edited",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function setAccountStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(accountStatusSchema, fd, (db, i) => setAccountStatus(db, i.id, i.status, i.reason), {
    name: "setAccountStatus",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Account status updated. History is preserved." };
}

export async function reconcileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(reconcileSchema, fd, (db, i) => reconcileAccount(db, i), {
    name: "reconcile",
    transform: (raw) => ({ ...raw, createAdjustment: raw.createAdjustment === "on" }),
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  const diff = (r.result as { differenceSatang: number }).differenceSatang;
  return {
    ok: true,
    message: diff === 0 ? "Reconciled — balances match." : "Reconciliation recorded with the difference noted.",
  };
}

// -------------------------------------------------------------- categories

export async function createCategoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(categoryCreateSchema, fd, (db, i) => createCategory(db, i), { name: "createCategory" });
  if (!r.ok) return r;
  revalidatePath("/categories");
  return { ok: true, message: "Category added." };
}

export async function toggleCategoryArchivedAction(fd: FormData): Promise<void> {
  await run(
    z.object({ id: uuid, archived: z.enum(["true", "false"]) }),
    fd,
    (db, i) => setCategoryArchived(db, i.id, i.archived === "true"),
    { name: "archiveCategory" },
  );
  revalidatePath("/categories");
}

// ------------------------------------------------------------ transactions

export async function createTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(transactionEntrySchema, fd, (db, i) => createTransaction(db, i), { name: "createTransaction" });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  const back = fd.get("returnTo");
  redirect(typeof back === "string" && back.startsWith("/") && !back.startsWith("//") ? back : "/transactions");
}

export async function updateTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(transactionUpdateSchema, fd, (db, i) => updateTransaction(db, i), {
    name: "updateTransaction",
    reason: (i) => i.reason,
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. The previous values are kept in the change history." };
}

export async function deleteTransactionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const restore = fd.get("restore") === "1";
  const r = await run(transactionDeleteSchema, fd, (db, i) => setTransactionDeleted(db, i, !restore), {
    name: "deleteTransaction",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: restore ? "Transaction restored." : "Transaction deleted (kept in history)." };
}

// --------------------------------------------------------------- snapshots

export async function createSnapshotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(snapshotCreateSchema, fd, (db, i) => createSnapshot(db, i.snapshotDate), {
    name: "createSnapshot",
  });
  if (!r.ok) return r;
  revalidatePath("/snapshots");
  revalidatePath("/reports");
  return { ok: true, message: "Snapshot saved." };
}

export async function rebuildSnapshotAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(snapshotRebuildSchema, fd, (db, i) => rebuildSnapshot(db, i.snapshotId, i.reason), {
    name: "rebuildSnapshot",
  });
  if (!r.ok) return r;
  revalidatePath("/snapshots");
  revalidatePath("/reports");
  return { ok: true, message: "Rebuilt. The previous snapshot is kept and marked as superseded." };
}

// ------------------------------------------------------------ subscriptions

export async function createSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(subscriptionSchema, fd, (db, i) => createSubscription(db, i), { name: "createSubscription" });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect(fd.get("type") === "income" ? "/income" : "/subscriptions");
}

export async function updateSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(subscriptionSchema.extend({ id: uuid }), fd, (db, { id, ...i }) => updateSubscription(db, id, i), {
    name: "updateSubscription",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved. Past payments keep their original amounts." };
}

export async function recordSubscriptionChargeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(subscriptionChargeSchema, fd, (db, i) => recordSubscriptionCharge(db, i), {
    name: "recordSubscriptionCharge",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Payment recorded." };
}

export async function skipSubscriptionChargeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(z.object({ id: uuid, dueDate: subscriptionChargeSchema.shape.dueDate }), fd, (db, i) =>
    skipSubscriptionCharge(db, i.id, i.dueDate), { name: "skipSubscriptionCharge" });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Skipped." };
}

export async function setSubscriptionStateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(z.object({ id: uuid, state: z.enum(["active", "paused", "cancelled"]) }), fd, (db, i) =>
    setSubscriptionState(db, i.id, i.state, bangkokDate()), { name: "setSubscriptionState" });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Updated." };
}

// ------------------------------------------------------------ credit cards

export async function saveCardDetailsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(cardDetailsUpdateSchema, fd, (db, { accountId, ...i }) => saveCardDetails(db, accountId, i), {
    name: "saveCardDetails",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Card details saved." };
}

// ------------------------------------------------------ money owed to me

export async function createReceivableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(receivableCreateSchema, fd, (db, i) => createReceivable(db, i), { name: "createReceivable" });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  redirect(`/receivables/${(r.result as { id: string }).id}`);
}

export async function updateReceivableAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(receivableUpdateSchema, fd, (db, i) => updateReceivable(db, i), { name: "updateReceivable" });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved." };
}

export async function recordReceivablePaymentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(receivablePaymentSchema, fd, (db, i) => recordReceivablePayment(db, i), {
    name: "recordReceivablePayment",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Payment recorded." };
}

export async function setReceivableWrittenOffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const r = await run(receivableWriteOffSchema, fd, (db, i) => setReceivableWrittenOff(db, i.id, i.writtenOff, i.reason), {
    name: "writeOffReceivable",
  });
  if (!r.ok) return r;
  revalidatePath("/", "layout");
  return { ok: true, message: "Updated." };
}
