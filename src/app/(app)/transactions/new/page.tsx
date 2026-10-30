import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { listCategories } from "@/lib/server/categories";
import { TransactionEntryForm } from "./entry-form";

export const metadata = { title: "Add transaction" };

export default async function NewTransactionPage({ searchParams }: { searchParams: Promise<{ accountId?: string }> }) {
  const user = await requireUser();
  const { accountId } = await searchParams;
  const { accounts, categories } = await withUserTransaction(user.id, async (db) => ({
    accounts: await listAccounts(db),
    categories: await listCategories(db),
  }));
  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader title="Add transaction" />
      {accounts.length === 0 ? (
        <Button asChild>
          <Link href="/accounts/new">Add an account first</Link>
        </Button>
      ) : (
        <Card>
          <CardContent className="p-4">
            <TransactionEntryForm
              today={bangkokDate()}
              defaultAccountId={accounts.some((a) => a.id === accountId) ? accountId! : accounts[0]!.id}
              accounts={accounts.map((a) => ({ id: a.id, name: a.name, kind: a.kind }))}
              categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
