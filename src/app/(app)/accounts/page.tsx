import Link from "next/link";
import { AccountIcon } from "@/components/category-icon";
import { CardAmount, CardViewToggle } from "@/components/card-view";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { EmptyRow, Row, Section } from "@/components/ui/list";
import { withUserTransaction } from "@/lib/db";
import { ACCOUNT_KIND_LABELS, isLiability } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";

export const metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  const showAll = (await searchParams).all === "1";
  const { accounts, limits } = await withUserTransaction(user.id, async (db) => ({
    accounts: await listAccounts(db, { includeInactive: showAll }),
    limits: new Map(
      (await db.query<{ account_id: string; credit_limit_satang: number }>("select account_id, credit_limit_satang from credit_cards")).rows.map(
        (r) => [r.account_id, r.credit_limit_satang],
      ),
    ),
  }));
  const assets = accounts.filter((a) => !isLiability(a.kind));
  const debts = accounts.filter((a) => isLiability(a.kind));
  const total = (rows: typeof accounts) => rows.filter((a) => a.status === "active").reduce((s, a) => s + a.balance_satang, 0);

  const list = (rows: typeof accounts, liability: boolean) =>
    rows.length ? (
      rows.map((a) => (
        <Row
          key={a.id}
          href={`/accounts/${a.id}`}
          leading={<AccountIcon kind={a.kind} />}
          title={a.name}
          subtitle={[ACCOUNT_KIND_LABELS[a.kind], a.institution, a.status !== "active" ? a.status : null].filter(Boolean).join(" · ")}
          trailing={
            a.kind === "credit_card" ? (
              <CardAmount owedSatang={-a.balance_satang} limitSatang={limits.get(a.id) ?? null} />
            ) : (
              <Money satang={liability ? -a.balance_satang : a.balance_satang} />
            )
          }
        />
      ))
    ) : (
      <EmptyRow>None</EmptyRow>
    );

  return (
    <>
      <PageHeader
        title="Accounts"
        actions={
          <Link href="/accounts/new" className="text-[17px] text-primary">
            Add
          </Link>
        }
      />
      <Section title="Money" action={<Money satang={total(assets)} className="text-[13px] text-muted-foreground" />}>
        {list(assets, false)}
      </Section>
      <Section
        title="Debts"
        action={
          limits.size > 0 ? <CardViewToggle /> : <Money satang={-total(debts)} className="text-[13px] text-muted-foreground" />
        }
      >
        {list(debts, true)}
      </Section>
      <Link href={showAll ? "/accounts" : "/accounts?all=1"} className="px-4 text-[15px] text-primary">
        {showAll ? "Hide archived and closed" : "Show archived and closed"}
      </Link>
    </>
  );
}
