import { verifyBackup } from "@/lib/server/backup";
import { readBackupUpload } from "@/lib/server/read-backup-upload";
import { getUserOrNull } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!(await getUserOrNull())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { data, error } = await readBackupUpload(req);
  if (error) return Response.json({ ok: false, errors: [error] }, { status: 400 });
  const r = verifyBackup(data);
  return Response.json({
    ok: r.ok,
    errors: r.errors,
    summary: r.backup
      ? { exported_at: r.backup.exported_at, schema_version: r.backup.schema_version, row_counts: r.backup.integrity.row_counts }
      : undefined,
  });
}
