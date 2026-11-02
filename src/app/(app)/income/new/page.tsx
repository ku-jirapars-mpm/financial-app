import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { LIQUID_KINDS } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { listCategories } from "@/lib/server/categories";
import { createSubscriptionAction } from "../../actions";
import { SubscriptionForm } from "../../subscriptions/subscription-form";

export const metadata = { title: "New recurring income" };

export default async function NewIncomePage() {
  const user = await requireUser();
  const { accounts, categories } = await withUserTransaction(user.id, async (db) => ({
    accounts: (await listAccounts(db)).filter((a) => LIQUID_KINDS.includes(a.kind) || a.kind === "other_asset"),
    categories: (await listCategories(db)).filter((c) => c.kind === "income"),
  }));
  // Income usually lands in a bank account.
  const defaultAccount = accounts.find((a) => a.kind === "bank") ?? accounts[0];
  const salary = categories.find((c) => c.name.toLowerCase() === "salary");
  return (
    <>
      <PageHeader title="Recurring income" />
      {!defaultAccount ? (
        <Button asChild>
          <Link href="/accounts/new">Add a bank account first</Link>
        </Button>
      ) : (
        <SubscriptionForm
          mode="income"
          action={createSubscriptionAction}
          submitLabel="Add income"
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          values={{
            name: "",
            counterparty: null,
            amountSatang: null,
            accountId: defaultAccount.id,
            categoryId: salary?.id ?? null,
            frequency: "monthly",
            intervalCount: 1,
            nextDate: bangkokDate(),
          }}
        />
      )}
    </>
  );
}
