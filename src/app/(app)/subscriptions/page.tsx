import { requireUser } from "@/lib/session";
import { RecurringList } from "./recurring-list";

export const metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const user = await requireUser();
  return <RecurringList userId={user.id} type="expense" showAll={(await searchParams).all === "1"} />;
}
