import { transactionsCsv } from "@/lib/server/exports";
import { download, stamp, userRoute } from "@/lib/server/route-helpers";

export const dynamic = "force-dynamic";

export function GET() {
  return userRoute(async (db) => download(await transactionsCsv(db), `myfinance-transactions-${stamp()}.csv`, "text/csv"));
}
