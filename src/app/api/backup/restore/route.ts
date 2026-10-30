import { verifyBackup, restoreBackup } from "@/lib/server/backup";
import { toUserMessage } from "@/lib/server/errors";
import { readBackupUpload } from "@/lib/server/read-backup-upload";
import { userRoute } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { data, error } = await readBackupUpload(req);
  if (error) return Response.json({ ok: false, errors: [error] }, { status: 400 });
  const check = verifyBackup(data);
  if (!check.ok || !check.backup) return Response.json({ ok: false, errors: check.errors }, { status: 400 });
  const backup = check.backup;
  try {
    return await userRoute(async (db) => Response.json({ ok: true, ...(await restoreBackup(db, backup)) }));
  } catch (err) {
    console.error("[restore] failed", { code: (err as { code?: string }).code });
    return Response.json({ ok: false, errors: [toUserMessage(err)] }, { status: 400 });
  }
}
