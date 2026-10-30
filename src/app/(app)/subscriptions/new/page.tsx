import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { listCategories } from "@/lib/server/categories";
import { createSubscriptionAction } from "../../actions";
import { SubscriptionForm } from "../subscription-form";

export const metadata = { title: "New subscription" };

export default async function NewSubscriptionPage() {
  const user = await requireUser();
  const { accounts, categories } = await withUserTransaction(user.id, async (db) => ({
    accounts: await listAccounts(db),
    categories: (await listCategories(db)).filter((c) => c.kind === "expense"),
  }));
  // Subscriptions are usually on a card: default to the first credit card.
  const defaultAccount = accounts.find((a) => a.kind === "credit_card") ?? accounts[0];
  return (
    <>
      <PageHeader title="New subscription" />
      {!defaultAccount ? (
        <Button asChild>
          <Link href="/accounts/new">Add an account first</Link>
        </Button>
      ) : (
        <SubscriptionForm
          action={createSubscriptionAction}
          submitLabel="Add subscription"
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          values={{
            name: "",
            counterparty: null,
            amountSatang: null,
            accountId: defaultAccount.id,
            categoryId: null,
            frequency: "monthly",
            intervalCount: 1,
            nextDate: bangkokDate(),
          }}
        />
      )}
    </>
  );
}
