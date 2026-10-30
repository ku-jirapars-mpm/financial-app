import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** iOS inset-grouped section: small caps header, rounded white group, optional footer. */
export function Section({
  title,
  action,
  footer,
  children,
  className,
}: {
  title?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid gap-1.5", className)}>
      {(title || action) && (
        <div className="flex items-end justify-between px-4">
          {title && <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>}
          {action && <div className="text-[15px] text-primary">{action}</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-2xl bg-card">{children}</div>
      {footer && <p className="px-4 text-[12px] text-muted-foreground">{footer}</p>}
    </section>
  );
}

/** A single list row with hairline separator inset past the leading icon. */
export function Row({
  href,
  leading,
  title,
  subtitle,
  trailing,
  trailingSub,
  chevron = Boolean(href),
  className,
}: {
  href?: string;
  leading?: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  trailing?: React.ReactNode;
  trailingSub?: React.ReactNode;
  chevron?: boolean;
  className?: string;
}) {
  const body = (
    <div className={cn("flex min-h-[52px] items-center gap-3 pl-4", className)}>
      {leading}
      <div className="flex min-w-0 flex-1 items-center gap-2 border-b border-border py-2.5 pr-4 group-last/row:border-b-0">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] leading-snug">{title}</div>
          {subtitle && <div className="truncate text-[13px] text-muted-foreground">{subtitle}</div>}
        </div>
        {(trailing || trailingSub) && (
          <div className="flex shrink-0 flex-col items-end">
            {trailing && <div className="text-[16px]">{trailing}</div>}
            {trailingSub && <div className="text-[12px] text-muted-foreground">{trailingSub}</div>}
          </div>
        )}
        {chevron && <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" />}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="group/row block active:bg-muted">
      {body}
    </Link>
  ) : (
    <div className="group/row">{body}</div>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-6 text-center text-[15px] text-muted-foreground">{children}</p>;
}
