import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/session";

// Financial pages are always rendered per request for the signed-in user; never cached.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell userName={user.email}>{children}</AppShell>;
}
