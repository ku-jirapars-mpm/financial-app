import { afterAll, beforeAll, expect, it } from "vitest";
import { createAccount, getAccount } from "../../src/lib/server/accounts";
import { ConcurrencyError, UserFacingError } from "../../src/lib/server/errors";
import {
  createSubscription,
  dueSubscriptions,
  getSubscription,
  listSubscriptions,
  monthlyEquivalent,
  recordSubscriptionCharge,
  setSubscriptionState,
  skipSubscriptionCharge,
  subscriptionPayments,
  updateSubscription,
} from "../../src/lib/server/subscriptions";
import { as, closePool, createUser, describeDb } from "./helpers";

describeDb("subscriptions", () => {
  let user: string;
  let card: string;
  let netflix: string;
  const base = {
    name: "Netflix",
    counterparty: "Netflix",
    amount: 41_900,
    categoryId: null,
    frequency: "monthly" as const,
    intervalCount: 1,
    nextDate: "2026-01-31",
  };

  beforeAll(async () => {
    user = await createUser();
    card = await as(user, (db) =>
      createAccount(db, { name: "Card", kind: "credit_card", institution: null, openingBalance: 0, openingBalanceDate: "2026-01-01", notes: null }),
    );
    netflix = await as(user, (db) => createSubscription(db, { ...base, accountId: card }));
  });
  afterAll(closePool);

  it("creates a subscription in the default Subscriptions category", async () => {
    const s = await as(user, (db) => getSubscription(db, netflix));
    expect(s).toMatchObject({ name: "Netflix", amount_satang: 41_900, next_occurrence_date: "2026-01-31", is_active: true });
    expect(s.category_name).toBe("Subscriptions");
    expect(monthlyEquivalent(120_000, "yearly", 1)).toBe(10_000);
    expect(monthlyEquivalent(10_000, "weekly", 1)).toBe(43_333);
  });

  it("records a charge atomically, advances the schedule without drift, and ignores double taps", async () => {
    const charge = { id: netflix, dueDate: "2026-01-31", amount: 41_900, date: "2026-01-31" };
    const results = await Promise.all([
      as(user, (db) => recordSubscriptionCharge(db, charge)),
      as(user, (db) => recordSubscriptionCharge(db, charge)),
      as(user, (db) => recordSubscriptionCharge(db, charge)),
    ]);
    // Concurrent double taps all resolve to the same single payment.
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(results.filter((r) => r.created)).toHaveLength(1);

    const s = await as(user, (db) => getSubscription(db, netflix));
    expect(s.next_occurrence_date).toBe("2026-02-28");
    expect(s.last_paid_date).toBe("2026-01-31");
    expect((await as(user, (db) => getAccount(db, card))).balance_satang).toBe(-41_900);

    // Replaying the same due date returns the original payment.
    const replay = await as(user, (db) => recordSubscriptionCharge(db, charge));
    expect(replay.created).toBe(false);

    await as(user, (db) => recordSubscriptionCharge(db, { id: netflix, dueDate: "2026-02-28", amount: 41_900, date: "2026-03-01" }));
    expect((await as(user, (db) => getSubscription(db, netflix))).next_occurrence_date).toBe("2026-03-31");
    expect(await as(user, (db) => subscriptionPayments(db, netflix))).toHaveLength(2);
  });

  it("rejects recording against a stale due date", async () => {
    await expect(
      as(user, (db) => recordSubscriptionCharge(db, { id: netflix, dueDate: "2026-02-28", amount: 1, date: "2026-03-05" })),
    ).resolves.toMatchObject({ created: false }); // already recorded → idempotent
    await expect(
      as(user, (db) => recordSubscriptionCharge(db, { id: netflix, dueDate: "2026-02-15", amount: 1, date: "2026-03-05" })),
    ).rejects.toBeInstanceOf(ConcurrencyError);
  });

  it("skips a month and lists due charges", async () => {
    expect((await as(user, (db) => dueSubscriptions(db, "2026-04-05"))).map((s) => s.id)).toEqual([netflix]);
    await as(user, (db) => skipSubscriptionCharge(db, netflix, "2026-03-31"));
    expect((await as(user, (db) => getSubscription(db, netflix))).next_occurrence_date).toBe("2026-04-30");
    expect(await as(user, (db) => dueSubscriptions(db, "2026-04-05"))).toHaveLength(0);
  });

  it("applies a price change and keeps past payments at the old price", async () => {
    await as(user, (db) => updateSubscription(db, netflix, { ...base, amount: 45_900, accountId: card, nextDate: "2026-04-30" }));
    const s = await as(user, (db) => getSubscription(db, netflix));
    expect(s.amount_satang).toBe(45_900);
    const payments = await as(user, (db) => subscriptionPayments(db, netflix));
    expect(payments.every((p) => p.amount_satang === -41_900)).toBe(true);
  });

  it("pauses, resumes and cancels while keeping history", async () => {
    await as(user, (db) => setSubscriptionState(db, netflix, "paused", "2026-05-10"));
    await expect(
      as(user, (db) => recordSubscriptionCharge(db, { id: netflix, dueDate: "2026-04-30", amount: 1, date: "2026-05-10" })),
    ).rejects.toBeInstanceOf(UserFacingError);
    await as(user, (db) => setSubscriptionState(db, netflix, "active", "2026-05-10"));
    expect((await as(user, (db) => getSubscription(db, netflix))).next_occurrence_date).toBe("2026-05-31");

    await as(user, (db) => setSubscriptionState(db, netflix, "cancelled", "2026-06-01"));
    const s = await as(user, (db) => getSubscription(db, netflix));
    expect(s).toMatchObject({ is_active: false, end_date: "2026-06-01", next_occurrence_date: null });
    expect(await as(user, (db) => listSubscriptions(db))).toHaveLength(0);
    expect(await as(user, (db) => listSubscriptions(db, { includeCancelled: true }))).toHaveLength(1);
    expect(await as(user, (db) => subscriptionPayments(db, netflix))).toHaveLength(2);
    await expect(as(user, (db) => db.query("delete from recurring_transactions"))).rejects.toThrow(/permission denied/);
  });

  it("is invisible to other users", async () => {
    const other = await createUser();
    expect(await as(other, (db) => listSubscriptions(db, { includeCancelled: true }))).toHaveLength(0);
  });
});
