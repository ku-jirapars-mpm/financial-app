"use client";
import { formatTHB } from "@/lib/money";
import { useUiStore } from "@/lib/stores/ui";
import { cn } from "@/lib/utils";

/**
 * Renders an integer-satang amount; blurred when privacy mode is on.
 * `signed`: "+฿1,000.00" in green for money in, "−฿120.00" in the normal ink for money out.
 */
export function Money({
  satang,
  className,
  colored = false,
  signed = false,
  whole = false,
}: {
  satang: number;
  className?: string;
  colored?: boolean;
  signed?: boolean;
  /** Drop ".00" for round amounts (limits, compact labels). */
  whole?: boolean;
}) {
  const hide = useUiStore((s) => s.hideAmounts);
  const base = signed ? `${satang > 0 ? "+" : satang < 0 ? "−" : ""}${formatTHB(Math.abs(satang))}` : formatTHB(satang).replace(/^-/, "−");
  const text = whole && satang % 100 === 0 ? base.replace(/\.00$/, "") : base;
  return (
    <span
      className={cn(
        "tabular-nums",
        colored && satang < 0 && "text-negative",
        (colored || signed) && satang > 0 && "text-positive",
        hide && "privacy-blur",
        className,
      )}
      aria-label={hide ? "hidden amount" : undefined}
    >
      {text}
    </span>
  );
}
