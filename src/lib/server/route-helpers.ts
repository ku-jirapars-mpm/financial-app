import "server-only";
import { withUserTransaction, type Db } from "../db";
import { getUserOrNull } from "../session";
import { bangkokDate } from "../dates";

/** Authenticated, RLS-scoped route handler body. Responses are never cached. */
export async function userRoute(fn: (db: Db, userId: string) => Promise<Response>): Promise<Response> {
  const user = await getUserOrNull();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return withUserTransaction(user.id, (db) => fn(db, user.id));
}

export function download(body: string, filename: string, type: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const stamp = () => bangkokDate();
