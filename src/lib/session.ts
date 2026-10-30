import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { withUserTransaction } from "./db";
import { ensureProfile } from "./server/profile";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

/**
 * Server-side authentication gate. Every page, server action and route that
 * touches financial data calls this; the returned id is what binds the
 * database session to the user for RLS.
 */
// Users whose profile is known to exist in this server instance; skips a DB transaction per request.
const ensuredProfiles = new Set<string>();

export const requireUser = cache(async (): Promise<SessionUser> => {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const user = { id: session.user.id, name: session.user.name, email: session.user.email };
  if (!ensuredProfiles.has(user.id)) {
    await withUserTransaction(user.id, (db) => ensureProfile(db, user.name));
    ensuredProfiles.add(user.id);
  }
  return user;
});

/** For route handlers: returns null instead of redirecting. */
export async function getUserOrNull(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  return { id: session.user.id, name: session.user.name, email: session.user.email };
}
