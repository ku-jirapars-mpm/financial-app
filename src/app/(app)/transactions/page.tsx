import Link from "next/link";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { Search, SlidersHorizontal } from "lucide-react";
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

  const activeFilters = [filter.accountId, filter.categoryId, filter.type, filter.from, filter.to, filter.includeDeleted].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Activity"
        actions={
          <Link href="/transactions/new" className="text-[17px] text-primary">
            Add
          </Link>
        }
      />
      <form method="get" className="grid gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            type="search"
            defaultValue={filter.q ?? ""}
            placeholder="Search"
            aria-label="Search"
            className="h-10 bg-muted pl-9"
          />
        </div>
        <details className="group rounded-2xl bg-card" open={activeFilters > 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-[15px]">
            <span>Filters{activeFilters ? ` · ${activeFilters}` : ""}</span>
            <SlidersHorizontal className="size-4 text-muted-foreground" />
          </summary>
          <div className="grid grid-cols-2 gap-3 px-4 pb-4">
            <div className="grid gap-1.5">
              <Label htmlFor="accountId">Account</Label>
              <Select id="accountId" name="accountId" defaultValue={filter.accountId ?? ""}>
                <option value="">All</option>
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
                <option value="">All</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="type">Type</Label>
              <Select id="type" name="type" defaultValue={filter.type ?? ""}>
                <option value="">All</option>
                {TRANSACTION_TYPES.map((t) => (
                  <option key={t} value={t}>{TRANSACTION_TYPE_LABELS[t]}</option>
                ))}
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-3 text-[14px]">
              <input type="checkbox" name="includeDeleted" value="1" defaultChecked={filter.includeDeleted} /> Show deleted
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={filter.from ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={filter.to ?? ""} />
            </div>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" size="sm">Apply filters</Button>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/transactions">Clear</Link>
              </Button>
            </div>
          </div>
        </details>
      </form>
      {!parsed.success && <p className="px-4 text-[13px] text-negative">Some filters were invalid and were ignored.</p>}
      <div className="flex items-center justify-between px-4 text-[13px] text-muted-foreground">
        <span>{result.total} transactions</span>
        <span>
          Net <Money satang={result.sumSatang} signed />
        </span>
      </div>
      <TransactionList rows={result.rows} />
      {pages > 1 && (
        <div className="flex items-center justify-center gap-4 text-[15px]">
          {filter.page > 1 && <Link className="text-primary" href={pageHref(filter.page - 1)}>Newer</Link>}
          <span className="text-muted-foreground">Page {filter.page} of {pages}</span>
          {filter.page < pages && <Link className="text-primary" href={pageHref(filter.page + 1)}>Older</Link>}
        </div>
      )}
    </>
  );
}
