import { requireUser } from "@/lib/session";
import { RecurringList } from "../subscriptions/recurring-list";

export const metadata = { title: "Recurring income" };

export default async function IncomePage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  return <RecurringList userId={user.id} type="income" showAll={(await searchParams).all === "1"} />;
}
