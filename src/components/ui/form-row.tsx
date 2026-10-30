/** iOS Settings-style row inside a grouped form: label left, control right. */
export function FormRow({
  label,
  htmlFor,
  children,
  error,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
  error?: string[];
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <label htmlFor={htmlFor} className="flex min-h-[50px] items-center gap-3 px-4">
        <span className="w-24 shrink-0 text-[16px]">{label}</span>
        <div className="min-w-0 flex-1 text-right">{children}</div>
      </label>
      {error?.length ? <p className="px-4 pb-2 text-right text-[12px] text-negative">{error.join(" ")}</p> : null}
    </div>
  );
}

/** Borderless right-aligned control style for use inside FormRow. */
export const bareControl =
  "h-auto w-full appearance-none bg-transparent px-0 text-right text-[16px] text-muted-foreground focus-visible:ring-0";

export function FormGroup({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="overflow-hidden rounded-2xl bg-card">{children}</div>
      {footer && <p className="px-4 text-[12px] text-muted-foreground">{footer}</p>}
    </div>
  );
}
