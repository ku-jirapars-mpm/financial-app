import Link from "next/link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent } from "@/components/ui/card";
import { withUserTransaction } from "@/lib/db";
import { ACCOUNT_KIND_LABELS, isLiability } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const showAll = (await searchParams).all === "1";
  const accounts = await withUserTransaction(user.id, (db) => listAccounts(db, { includeInactive: showAll }));
  const groups = [
    { title: "Cash & bank", rows: accounts.filter((a) => !isLiability(a.kind)) },
    { title: "Debts", rows: accounts.filter((a) => isLiability(a.kind)) },
  ];
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Accounts"
        description="Balances are calculated from the opening balance plus recorded transactions."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={showAll ? "/accounts" : "/accounts?all=1"}>{showAll ? "Active only" : "Show archived & closed"}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/accounts/new">Add account</Link>
            </Button>
          </>
        }
      />
      {groups.map((g) => (
        <section key={g.title} className="grid gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">{g.title}</h2>
          <Card>
            <CardContent className="divide-y p-0">
              {g.rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">None.</p>}
              {g.rows.map((a) => (
                <Link key={a.id} href={`/accounts/${a.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted/50">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {ACCOUNT_KIND_LABELS[a.kind]}
                      {a.institution && ` · ${a.institution}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Money satang={a.balance_satang} colored={a.balance_satang < 0} className="font-medium" />
                    {a.status !== "active" && <Badge tone="muted">{a.status}</Badge>}
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
