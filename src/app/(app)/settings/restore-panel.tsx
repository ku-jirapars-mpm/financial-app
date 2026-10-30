"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Result {
  ok: boolean;
  errors?: string[];
  summary?: { exported_at: string; schema_version: string; row_counts: Record<string, number> };
  restored?: Record<string, number>;
  balancesVerified?: number;
}

export function RestorePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [pending, setPending] = useState(false);

  async function send(path: string) {
    if (!file) return;
    if (path.endsWith("restore") && !window.confirm("Restore this backup into your (empty) profile?")) return;
    setPending(true);
    const body = new FormData();
    body.set("file", file);
    const res = await fetch(path, { method: "POST", body });
    setResult(await res.json().catch(() => ({ ok: false, errors: ["Unexpected response."] })));
    setPending(false);
  }

  return (
    <div className="grid gap-3">
      <Input type="file" accept="application/json,.json" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={!file || pending} onClick={() => send("/api/backup/verify")}>
          Check integrity
        </Button>
        <Button disabled={!file || pending} onClick={() => send("/api/backup/restore")}>
          Restore
        </Button>
      </div>
      {result && (
        <Alert tone={result.ok ? "info" : "error"}>
          {result.ok ? (
            result.restored ? (
              <>Restored successfully. {result.balancesVerified} account balances verified against the backup.</>
            ) : (
              <>
                Backup is intact (checksum and row counts verified). Exported {result.summary?.exported_at}, schema{" "}
                {result.summary?.schema_version}, {result.summary?.row_counts.transactions} transactions.
              </>
            )
          ) : (
            <ul className="list-disc pl-4">{result.errors?.map((e) => <li key={e}>{e}</li>)}</ul>
          )}
        </Alert>
      )}
    </div>
  );
}
