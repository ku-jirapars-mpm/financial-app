import { debtsJson } from "@/lib/server/exports";
import { download, stamp, userRoute } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

export function GET() {
  return userRoute(async (db) =>
    download(JSON.stringify(await debtsJson(db), null, 1), `myfinance-debts-${stamp()}.json`, "application/json"),
  );
}
