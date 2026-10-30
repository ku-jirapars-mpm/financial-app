/** iOS large-title header. Keep descriptions short or omit them. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-3 px-1 pt-2">
      <div className="min-w-0">
        <h1 className="truncate text-[32px] font-bold leading-tight tracking-tight">{title}</h1>
        {description && <p className="text-[14px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2 pb-1">{actions}</div>}
    </div>
  );
}
