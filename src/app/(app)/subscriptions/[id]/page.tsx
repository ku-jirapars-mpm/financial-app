import { uuidOr404 } from "@/lib/not-found";
import { requireUser } from "@/lib/session";
import { RecurringDetail } from "../recurring-detail";

export const metadata = { title: "Subscription" };

export default async function SubscriptionPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  return <RecurringDetail userId={user.id} id={uuidOr404((await params).id)} type="expense" />;
}
