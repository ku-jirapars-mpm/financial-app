import { createBackup } from "@/lib/server/backup";
import { download, stamp, userRoute } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

export function GET() {
  return userRoute(async (db, userId) =>
    download(JSON.stringify(await createBackup(db, userId), null, 1), `myfinance-backup-${stamp()}.json`, "application/json"),
  );
}
