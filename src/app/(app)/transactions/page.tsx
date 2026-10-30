import Link from "next/link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";
import { withUserTransaction } from "@/lib/db";
import { TRANSACTION_TYPES, TRANSACTION_TYPE_LABELS } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { listCategories } from "@/lib/server/categories";
import { PAGE_SIZE, listTransactions } from "@/lib/server/transactions";
import { transactionFilterSchema } from "@/lib/validation";

export const metadata = { title: "Transactions" };

type SP = Record<string, string | string[] | undefined>;

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const raw = Object.fromEntries(Object.entries(sp).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const parsed = transactionFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : transactionFilterSchema.parse({});
  const { accounts, categories, result } = await withUserTransaction(user.id, async (db) => ({
    accounts: await listAccounts(db, { includeInactive: true }),
    categories: await listCategories(db, { includeArchived: true }),
    result: await listTransactions(db, filter),
  }));
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const pageHref = (page: number) => {
    const q = new URLSearchParams(Object.entries(raw).filter(([, v]) => v) as [string, string][]);
    q.set("page", String(page));
    return `/transactions?${q}`;
  };

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Transaction history"
        description="Search every recorded transaction. Deleted transactions are kept and can be shown."
        actions={
          <Button size="sm" asChild>
            <Link href="/transactions/new">Add</Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="p-4">
          <form className="grid grid-cols-2 gap-3 md:grid-cols-4" method="get">
            <div className="col-span-2 grid gap-1.5">
              <Label htmlFor="q">Search</Label>
              <Input id="q" name="q" defaultValue={filter.q ?? ""} placeholder="Description, payee or notes" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="accountId">Account</Label>
              <Select id="accountId" name="accountId" defaultValue={filter.accountId ?? ""}>
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.status !== "active" ? ` (${a.status})` : ""}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <Select id="categoryId" name="categoryId" defaultValue={filter.categoryId ?? ""}>
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue={filter.type ?? ""}>
                <option value="">All types</option>
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={filter.from ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={filter.to ?? ""} />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm">
              <input type="checkbox" name="includeDeleted" value="1" defaultChecked={filter.includeDeleted} /> Show deleted
            </label>
            <div className="col-span-2 flex gap-2 md:col-span-4">
              <Button type="submit" size="sm">Apply filters</Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transactions">Reset</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {!parsed.success && <p className="text-sm text-negative">Some filters were invalid and were ignored.</p>}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{result.total} transactions</span>
        <span>
          Net of shown filters: <Money satang={result.sumSatang} colored />
        </span>
      </div>
      <Card>
        <CardContent className="py-1">
          <TransactionList rows={result.rows} />
        </CardContent>
      </Card>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-3 text-sm">
          {filter.page > 1 && <Link className="text-primary" href={pageHref(filter.page - 1)}>← Newer</Link>}
          <span>Page {filter.page} of {pages}</span>
          {filter.page < pages && <Link className="text-primary" href={pageHref(filter.page + 1)}>Older →</Link>}
        </div>
      )}
    </div>
  );
}
