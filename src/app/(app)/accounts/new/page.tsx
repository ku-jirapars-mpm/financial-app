import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { bangkokDate } from "@/lib/dates";
import { AccountForm } from "./account-form";

export const metadata = { title: "New account" };

export default function NewAccountPage() {
  return (
    <div className="grid max-w-xl gap-6">
      <PageHeader title="New account" />
      <Card>
        <CardContent className="p-4">
          <AccountForm today={bangkokDate()} />
        </CardContent>
      </Card>
    </div>
  );
}
