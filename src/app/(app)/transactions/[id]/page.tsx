import Link from "next/link";
import { AuditHistory } from "@/components/audit-history";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { TRANSACTION_TYPE_LABELS } from "@/lib/domain";
import { or404, uuidOr404 } from "@/lib/not-found";
import { requireUser } from "@/lib/session";
import { listCategories } from "@/lib/server/categories";
import { getRecordHistory, getTransaction } from "@/lib/server/transactions";
import { DeleteTransactionForm, EditTransactionForm } from "./forms";

export const metadata = { title: "Transaction" };

export default async function TransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = uuidOr404((await params).id);
  const { tx, history, categories, breakdown } = await or404(
    withUserTransaction(user.id, async (db) => {
      const tx = await getTransaction(db, id);
      const { rows: breakdown } = await db.query<{ principal_satang: number; interest_satang: number; fees_satang: number }>(
        `select d.principal_satang, d.interest_satang, d.fees_satang from debt_payments d
         join transactions t on t.id = d.transaction_id
         where t.transfer_group_id = $1`,
        [tx.transfer_group_id],
      );
      return {
        tx,
        breakdown: breakdown[0] ?? null,
        history: await getRecordHistory(db, "transactions", id),
        categories: (await listCategories(db)).filter((c) => (tx.amount_satang > 0 ? c.kind === "income" : c.kind === "expense")),
      };
    }),
  );
  const editable = !tx.deleted_at && tx.type !== "adjustment";

  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title={tx.description || TRANSACTION_TYPE_LABELS[tx.type]} />
      {tx.deleted_at && (
        <Alert tone="error">
          Deleted {formatDateTime(tx.deleted_at)} — {tx.deleted_reason}. It no longer affects balances but remains in your history.
        </Alert>
      )}
      <Card>
        <CardContent className="grid gap-3 p-4 text-sm">
          <Money satang={tx.amount_satang} colored className="text-2xl font-semibold" />
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">Type</dt>
            <dd><Badge>{TRANSACTION_TYPE_LABELS[tx.type]}</Badge></dd>
            <dt className="text-muted-foreground">Account</dt>
            <dd><Link className="text-primary" href={`/accounts/${tx.account_id}`}>{tx.account_name}</Link></dd>
            {tx.counterpart_account_name && (
              <>
                <dt className="text-muted-foreground">{tx.amount_satang < 0 ? "To" : "From"}</dt>
                <dd>{tx.counterpart_account_name}</dd>
              </>
            )}
            {tx.category_name && (
              <>
                <dt className="text-muted-foreground">Category</dt>
                <dd>{tx.category_name}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Transaction date</dt>
            <dd>{formatDate(tx.transaction_date)}</dd>
            <dt className="text-muted-foreground">Recorded</dt>
            <dd>{formatDateTime(tx.created_at)}</dd>
            <dt className="text-muted-foreground">Last modified</dt>
            <dd>{formatDateTime(tx.updated_at)} (version {tx.version})</dd>
            {tx.counterparty && (
              <>
                <dt className="text-muted-foreground">Payee / payer</dt>
                <dd>{tx.counterparty}</dd>
              </>
            )}
            {tx.notes && (
              <>
                <dt className="text-muted-foreground">Notes</dt>
                <dd className="whitespace-pre-wrap">{tx.notes}</dd>
              </>
            )}
            {breakdown && (
              <>
                <dt className="text-muted-foreground">Breakdown</dt>
                <dd>
                  principal <Money satang={breakdown.principal_satang} /> · interest <Money satang={breakdown.interest_satang} /> ·
                  fees <Money satang={breakdown.fees_satang} />
                </dd>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      {editable && (
        <Card>
          <CardHeader>
            <CardTitle>Correct this transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <EditTransactionForm
              id={tx.id}
              version={tx.version}
              amountSatang={tx.amount_satang}
              date={tx.transaction_date}
              categoryId={tx.category_id}
              description={tx.description}
              counterparty={tx.counterparty}
              notes={tx.notes}
              isTransfer={Boolean(tx.transfer_group_id)}
              categories={categories}
            />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>{tx.deleted_at ? "Restore" : "Delete"}</CardTitle>
        </CardHeader>
        <CardContent>
          <DeleteTransactionForm id={tx.id} version={tx.version} deleted={Boolean(tx.deleted_at)} />
        </CardContent>
      </Card>
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
