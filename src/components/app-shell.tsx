"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  BarChart3,
  Camera,
  Eye,
  EyeOff,
  Home,
  LogOut,
  Menu,
  Plus,
  Settings,
  Tags,
  Wallet,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/snapshots", label: "Snapshots", icon: Camera },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Backup & export", icon: Settings },
];

const MOBILE = [
  { href: "/", label: "Home", icon: Home },
  { href: "/transactions", label: "History", icon: ArrowLeftRight },
  { href: "/transactions/new", label: "Add", icon: Plus, primary: true },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/more", label: "More", icon: Menu },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/transactions" && pathname === "/transactions/new") return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { hideAmounts, toggleHideAmounts } = useUiStore();

  async function signOut() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col gap-1 border-r p-4 md:flex">
        <div className="mb-4 px-2 text-lg font-semibold">MyFinance</div>
        <Link
          href="/transactions/new"
          className="mb-2 flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
        >
          <Plus className="size-4" /> Add transaction
        </Link>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              isActive(pathname, href) ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <Icon className="size-4" /> {label}
          </Link>
        ))}
        <div className="mt-auto grid gap-1 border-t pt-3 text-sm">
          <button onClick={toggleHideAmounts} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
            {hideAmounts ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {hideAmounts ? "Show amounts" : "Hide amounts"}
          </button>
          <button onClick={signOut} className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted">
            <LogOut className="size-4" /> Sign out
          </button>
          <p className="truncate px-3 text-xs text-muted-foreground">{userName}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <span className="font-semibold">MyFinance</span>
          <button
            onClick={toggleHideAmounts}
            aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
            className="rounded-md p-2 hover:bg-muted"
          >
            {hideAmounts ? <Eye className="size-5" /> : <EyeOff className="size-5" />}
          </button>
        </header>
        <main className="flex-1 p-4 pb-28 md:p-6 md:pb-6">{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {MOBILE.map(({ href, label, icon: Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[11px]",
              isActive(pathname, href) && !primary ? "text-primary" : "text-muted-foreground",
            )}
          >
            {primary ? (
              <span className="-mt-1 flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Icon className="size-5" />
              </span>
            ) : (
              <Icon className="size-5" />
            )}
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      className="flex w-full items-center gap-2 rounded-md px-3 py-3 text-left hover:bg-muted"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut className="size-4" /> Sign out
    </button>
  );
}

export function MoreMenu() {
  return (
    <div className="grid divide-y rounded-lg border bg-card">
      {NAV.filter((n) => !["/", "/transactions", "/accounts"].includes(n.href)).map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="flex items-center gap-2 px-3 py-3 hover:bg-muted">
          <Icon className="size-4" /> {label}
        </Link>
      ))}
      <SignOutButton />
    </div>
  );
}
