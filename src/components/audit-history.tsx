import { Money } from "@/components/money";
import { formatDateTime } from "@/lib/dates";
import type { AuditEntry } from "@/lib/server/transactions";

const HIDDEN = new Set(["id", "owner_id", "version", "updated_at", "created_at", "idempotency_key", "transfer_group_id"]);

function show(field: string, v: unknown) {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (field.endsWith("_satang") && typeof v === "number") return <Money satang={v} />;
  return <span>{String(v)}</span>;
}

/** Field-level change history from audit_logs (who/when is always the account owner). */
export function AuditHistory({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) return <p className="text-sm text-muted-foreground">No history recorded.</p>;
  return (
    <ol className="grid gap-3 text-sm">
      {entries.map((e) => (
        <li key={e.id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="font-medium capitalize">{e.action === "insert" ? "created" : e.action}</span>
            <span className="text-xs text-muted-foreground">{formatDateTime(e.changed_at)}</span>
          </div>
          {e.reason && <p className="mt-1 text-xs">Reason: {e.reason}</p>}
          {e.action === "update" && e.changed_fields && (
            <table className="mt-2 w-full text-xs">
              <tbody>
                {e.changed_fields
                  .filter((f) => !HIDDEN.has(f))
                  .map((f) => (
                    <tr key={f} className="align-top">
                      <td className="pr-2 text-muted-foreground">{f.replace(/_satang$/, "").replace(/_/g, " ")}</td>
                      <td className="pr-2">{show(f, e.old_data?.[f])}</td>
                      <td className="pr-1">→</td>
                      <td>{show(f, e.new_data?.[f])}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </li>
      ))}
    </ol>
  );
}
