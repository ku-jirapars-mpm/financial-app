import { MoreMenu } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/session";

export const metadata = { title: "More" };

export default async function MorePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="More" />
      <MoreMenu userName={user.email} />
    </>
  );
}
