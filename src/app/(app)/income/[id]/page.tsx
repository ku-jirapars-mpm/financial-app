import { uuidOr404 } from "@/lib/not-found";
import { requireUser } from "@/lib/session";
import { RecurringDetail } from "../../subscriptions/recurring-detail";

export const metadata = { title: "Recurring income" };

export default async function IncomeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  return <RecurringDetail userId={user.id} id={uuidOr404((await params).id)} type="income" />;
}
