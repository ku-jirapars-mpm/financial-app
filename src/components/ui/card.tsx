import * as React from "react";
import { cn } from "@/lib/utils";

/** Inset rounded surface (iOS grouped style): no border, no shadow. */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl bg-card text-card-foreground", className)} {...props} />;
}
export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-0.5 px-4 pt-4 pb-1", className)} {...props} />;
}
export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[17px] font-semibold leading-tight", className)} {...props} />;
}
export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[13px] text-muted-foreground", className)} {...props} />;
}
export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-2", className)} {...props} />;
}

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: "default" | "warning" | "muted" | "negative" | "positive" }) {
  const tones = {
    default: "bg-secondary text-secondary-foreground",
    muted: "bg-muted text-muted-foreground",
    warning: "bg-warning/15 text-warning",
    negative: "bg-negative/12 text-negative",
    positive: "bg-positive/12 text-positive",
  };
  return (
    <span
      className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium", tones[tone], className)}
      {...props}
    />
  );
}

export function Alert({
  className,
  tone = "warning",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { tone?: "warning" | "info" | "error" }) {
  const tones = {
    warning: "bg-warning/12 text-foreground",
    info: "bg-card text-foreground",
    error: "bg-negative/10 text-negative",
  };
  return <div role="note" className={cn("rounded-xl px-4 py-3 text-[14px]", tones[tone], className)} {...props} />;
}
