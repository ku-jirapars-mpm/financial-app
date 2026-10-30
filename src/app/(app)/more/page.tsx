import { MoreMenu } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";

export const metadata = { title: "More" };

export default function MorePage() {
  return (
    <div className="grid gap-4">
      <PageHeader title="More" />
      <MoreMenu />
    </div>
  );
}
