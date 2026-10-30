"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart3,
  Camera,
  ChevronRight,
  Eye,
  EyeOff,
  House,
  List,
  LogOut,
  PlusCircle,
  Settings,
  Tags,
  Wallet,
  Ellipsis,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Overview", icon: House },
  { href: "/transactions", label: "Activity", icon: List },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/snapshots", label: "Snapshots", icon: Camera },
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/settings", label: "Backup & export", icon: Settings },
];

const TABS = [
  { href: "/", label: "Overview", icon: House },
  { href: "/transactions", label: "Activity", icon: List },
  { href: "/transactions/new", label: "Add", icon: PlusCircle },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/more", label: "More", icon: Ellipsis },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/transactions" && pathname === "/transactions/new") return false;
  if (href === "/more") return ["/more", "/accounts", "/snapshots", "/categories", "/settings"].some((p) => pathname.startsWith(p));
  return pathname === href || pathname.startsWith(`${href}/`);
}

function useSignOut() {
  const router = useRouter();
  return async () => {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };
}

export function PrivacyToggle({ className }: { className?: string }) {
  const { hideAmounts, toggleHideAmounts } = useUiStore();
  return (
    <button
      onClick={toggleHideAmounts}
      aria-label={hideAmounts ? "Show amounts" : "Hide amounts"}
      className={cn("rounded-full p-2 text-primary active:opacity-60", className)}
    >
      {hideAmounts ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
    </button>
  );
}

export function AppShell({ userName, children }: { userName: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const signOut = useSignOut();

  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-0.5 px-3 py-6 md:flex">
        <div className="mb-5 px-3 text-[20px] font-bold tracking-tight">MyFinance</div>
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 text-[15px]",
              isActive(pathname, href) ? "bg-card font-semibold text-primary" : "text-foreground/80 hover:bg-card/60",
            )}
          >
            <Icon className="size-[18px]" /> {label}
          </Link>
        ))}
        <Link
          href="/transactions/new"
          className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-[15px] font-semibold text-primary-foreground"
        >
          <PlusCircle className="size-[18px]" /> New transaction
        </Link>
        <div className="mt-auto grid gap-0.5 text-[14px]">
          <PrivacyToggle className="justify-self-start" />
          <button onClick={signOut} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left hover:bg-card/60">
            <LogOut className="size-4" /> Sign out
          </button>
          <p className="truncate px-3 text-[12px] text-muted-foreground">{userName}</p>
        </div>
      </aside>

      <main
        className="min-w-0 flex-1 px-4 pb-32 md:px-8 md:pb-10"
        style={{ paddingTop: "max(env(safe-area-inset-top), 12px)" }}
      >
        <div className="mx-auto grid max-w-2xl gap-6 md:pt-6">{children}</div>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border bg-background/85 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      >
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          const add = href === "/transactions/new";
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex flex-col items-center gap-0.5 pt-2 text-[10px] font-medium",
                add || active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={add ? "size-7" : "size-6"} strokeWidth={active || add ? 2.3 : 1.8} />
              {!add && label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function MoreMenu({ userName }: { userName: string }) {
  const signOut = useSignOut();
  const items = NAV.filter((n) => !["/", "/transactions", "/reports"].includes(n.href));
  return (
    <div className="grid gap-6">
      <div className="overflow-hidden rounded-2xl bg-card">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 pl-4 active:bg-muted">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary/12 text-primary">
              <Icon className="size-[18px]" />
            </span>
            <span className="flex flex-1 items-center border-b border-border py-3 pr-4 text-[16px]">
              <span className="flex-1">{label}</span>
              <ChevronRight className="size-4 text-muted-foreground/60" />
            </span>
          </Link>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl bg-card">
        <button onClick={signOut} className="w-full px-4 py-3 text-left text-[16px] text-destructive active:bg-muted">
          Sign out
        </button>
      </div>
      <p className="text-center text-[12px] text-muted-foreground">Signed in as {userName}</p>
    </div>
  );
}
