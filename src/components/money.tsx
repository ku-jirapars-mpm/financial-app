"use client";
import { formatTHB } from "@/lib/money";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/** Renders an integer-satang amount; blurred when privacy mode is on. */
export function Money({
  satang,
  className,
  colored = false,
}: {
  satang: number;
  className?: string;
  colored?: boolean;
}) {
  const hide = useUiStore((s) => s.hideAmounts);
  return (
    <span
      className={cn(
        "tabular-nums",
        colored && satang < 0 && "text-negative",
        colored && satang > 0 && "text-positive",
        hide && "privacy-blur",
        className,
      )}
      aria-label={hide ? "hidden amount" : undefined}
    >
      {formatTHB(satang)}
    </span>
  );
}
