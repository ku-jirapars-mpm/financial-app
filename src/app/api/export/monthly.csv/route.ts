import { addMonths, bangkokDate, monthStart } from "@/lib/dates";
import { monthlyCsv } from "@/lib/server/exports";
import { download, stamp, userRoute } from "@/lib/server/route-helpers";
import { periodSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const url = new URL(req.url);
  const today = bangkokDate();
  const p = periodSchema.safeParse({
    from: url.searchParams.get("from") ?? monthStart(addMonths(today, -11)),
    to: url.searchParams.get("to") ?? today,
  });
  if (!p.success) return Response.json({ error: "invalid period" }, { status: 400 });
  return userRoute(async (db) =>
    download(await monthlyCsv(db, p.data.from, p.data.to), `myfinance-monthly-${stamp()}.csv`, "text/csv"),
  );
}
