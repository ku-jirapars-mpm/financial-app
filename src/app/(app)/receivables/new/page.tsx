import { PageHeader } from "@/components/page-header";
import { bangkokDate } from "@/lib/dates";
import { withUserTransaction } from "@/lib/db";
import { LIQUID_KINDS } from "@/lib/domain";
import { requireUser } from "@/lib/session";
import { listAccounts } from "@/lib/server/accounts";
import { ReceivableForm } from "./receivable-form";

export const metadata = { title: "Someone owes me" };

export default async function NewReceivablePage() {
  const user = await requireUser();
  const accounts = await withUserTransaction(user.id, (db) => listAccounts(db));
  return (
    <>
      <PageHeader title="Someone owes me" />
      <ReceivableForm
        today={bangkokDate()}
        accounts={accounts.filter((a) => LIQUID_KINDS.includes(a.kind)).map((a) => ({ id: a.id, name: a.name }))}
      />
    </>
  );
}
