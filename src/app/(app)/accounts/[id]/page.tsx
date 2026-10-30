import Link from "next/link";
import { AuditHistory } from "@/components/audit-history";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { TransactionList } from "@/components/transaction-list";
import { Button } from "@/components/ui/button";
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { bangkokDate, formatDate, formatDateTime } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { ACCOUNT_KIND_LABELS, isLiability } from "@/lib/domain";
import { or404, uuidOr404 } from "@/lib/not-found";
import { requireUser } from "@/lib/session";
import { getAccount, listReconciliations } from "@/lib/server/accounts";
import { getRecordHistory, listTransactions } from "@/lib/server/transactions";
import { transactionFilterSchema } from "@/lib/validation";
import { EditAccountForm, ReconcileForm, StatusForm } from "./account-forms";
import { CardDetailsForm } from "./card-details-form";
import { CardSummary } from "@/components/card-summary";
import { cardStatus } from "@/lib/server/credit-cards";

export const metadata = { title: "Account" };

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuidOr404((await params).id);
  const today = bangkokDate();
  const { account, recs, txs, history, card } = await or404(
    withUserTransaction(user.id, async (db) => ({
      account: await getAccount(db, id),
      card: await cardStatus(db, id, today),
      recs: await listReconciliations(db, id),
      txs: await listTransactions(db, transactionFilterSchema.parse({ accountId: id })),
      history: await getRecordHistory(db, "accounts", id),
    })),
  );
  const liability = isLiability(account.kind);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={account.name}
        description={`${ACCOUNT_KIND_LABELS[account.kind]}${account.institution ? ` · ${account.institution}` : ""}`}
        actions={
          account.status === "active" ? (
            <Button size="sm" asChild>
              <Link href={`/transactions/new?accountId=${account.id}`}>Add transaction</Link>
            </Button>
          ) : undefined
        }
      />
      {account.status !== "active" && (
        <Alert>
          This account is <strong>{account.status}</strong>
          {account.closed_reason && ` (${account.closed_reason})`}. Its history is preserved; reopen it to add or change
          transactions.
        </Alert>
      )}

      {account.kind === "credit_card" &&
        (card ? (
          <CardSummary accountId={account.id} status={card} today={today} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Set up this card</CardTitle>
              <CardDescription>Add the limit, statement day and due day to track usage and payment dates.</CardDescription>
            </CardHeader>
            <CardContent>
              <CardDetailsForm accountId={account.id} />
            </CardContent>
          </Card>
        ))}

      <Card>
        <CardContent className="grid gap-1 p-4">
          <p className="text-xs text-muted-foreground">{liability ? "Amount owed" : "Balance"}</p>
          <Money satang={liability ? -account.balance_satang : account.balance_satang} className="text-2xl font-semibold" />
          <p className="text-xs text-muted-foreground">
            Opening {liability ? "debt" : "balance"} <Money satang={Math.abs(account.opening_balance_satang)} /> on{" "}
            {formatDate(account.opening_balance_date)} · created {formatDateTime(account.created_at)}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Transactions</CardTitle>
          <Link href={`/transactions?accountId=${account.id}`} className="text-sm text-primary">
            Search all {txs.total}
          </Link>
        </CardHeader>
        <CardContent>
          <TransactionList rows={txs.rows.slice(0, 20)} showAccount={false} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {account.status === "active" && (
          <Card>
            <CardHeader>
              <CardTitle>Reconcile</CardTitle>
              <CardDescription>Compare with your bank or card statement. Every reconciliation is kept permanently.</CardDescription>
            </CardHeader>
            <CardContent>
              <ReconcileForm accountId={account.id} today={today} liability={liability} />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation history</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {recs.length === 0 && <p className="text-muted-foreground">Not reconciled yet.</p>}
            {recs.map((r) => (
              <div key={r.id} className="rounded-md border p-2">
                <div className="flex justify-between">
                  <span>{formatDate(r.reconciled_as_of)}</span>
                  {r.difference_satang === 0 ? (
                    <Badge tone="positive">matched</Badge>
                  ) : (
                    <Badge tone="warning">
                      diff&nbsp;<Money satang={r.difference_satang} />
                    </Badge>
                  )}
                </div>
                {r.reason && <p className="text-xs text-muted-foreground">{r.reason}</p>}
                <p className="text-xs text-muted-foreground">Recorded {formatDateTime(r.created_at)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        {card && (
          <Card>
            <CardHeader>
              <CardTitle>Card terms</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDetailsForm
                accountId={account.id}
                defaults={{
                  creditLimit: card.details.credit_limit_satang,
                  statementDay: card.details.statement_day,
                  dueDay: card.details.due_day,
                }}
              />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <EditAccountForm
              id={account.id}
              version={account.version}
              name={account.name}
              institution={account.institution}
              notes={account.notes}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Archive / close / reopen</CardTitle>
            <CardDescription>Accounts are never deleted. Closing keeps every past transaction.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusForm id={account.id} status={account.status} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Change history</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditHistory entries={history} />
        </CardContent>
      </Card>
    </div>
  );
}
