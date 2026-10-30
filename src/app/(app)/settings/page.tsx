import { PageHeader } from "@/components/page-header";
import { Alert, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/session";
import { RestorePanel } from "./restore-panel";

export const metadata = { title: "Backup & export" };

const EXPORTS = [
  {
    href: "/api/export/backup",
    title: "Full backup (JSON)",
    text: "Every record you own — accounts, transactions, debts, installments, reconciliations, snapshots and the full audit history — with a SHA-256 integrity checksum. This is the file to keep.",
  },
  { href: "/api/export/transactions.csv", title: "Transactions (CSV)", text: "All transactions, including deleted ones with their reason, for spreadsheets." },
  { href: "/api/export/monthly.csv", title: "Monthly report (CSV)", text: "Income, expenses, debt payments, interest & fees and net cash flow per month (last 12 months)." },
  { href: "/api/export/debts.json", title: "Debts & installment plans (JSON)", text: "Liability accounts, cards, statements, loans, installment schedules and debt payments." },
];

export default async function SettingsPage() {
  await requireUser();
  return (
    <div className="grid max-w-3xl gap-6">
      <PageHeader title="Backup & export" />
      <Alert>
        CSV exports are convenient for spreadsheets but are <strong>not</strong> a complete backup. Use the full JSON backup
        (and the database backups described in docs/BACKUP_AND_RESTORE.md) to be able to recover everything.
      </Alert>
      <div className="grid gap-3">
        {EXPORTS.map((e) => (
          <Card key={e.href}>
            <CardHeader>
              <CardTitle>
                <a className="text-primary underline-offset-4 hover:underline" href={e.href}>{e.title}</a>
              </CardTitle>
              <CardDescription>{e.text}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Restore from backup</CardTitle>
          <CardDescription>
            The file is validated (format, checksum, row counts) before anything is written. Restore runs in a single
            database transaction and only into a profile with no accounts, transactions or snapshots; account balances
            are verified afterwards and any mismatch rolls everything back.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RestorePanel />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No analytics or trackers are loaded, and nothing is sent to AI services. Financial data is never cached on this
          device by the app.
        </CardContent>
      </Card>
    </div>
  );
}
