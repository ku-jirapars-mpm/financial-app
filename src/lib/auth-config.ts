import type { BetterAuthOptions } from "better-auth";
import type { Pool } from "pg";

/** Accepts "example.vercel.app" as well as a full URL; trailing slashes are dropped. */
export function normalizeBaseUrl(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/\/+$/, "");
  if (!v) return undefined;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * Origins allowed to call the auth API: the configured app URL, this
 * deployment's own Vercel URLs (system env vars), and any extra exact origins
 * listed comma-separated in BETTER_AUTH_TRUSTED_ORIGINS. No wildcards, so
 * other *.vercel.app sites are never trusted.
 */
export function trustedOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const candidates = [
    env.BETTER_AUTH_URL,
    env.VERCEL_PROJECT_PRODUCTION_URL,
    env.VERCEL_BRANCH_URL,
    env.VERCEL_URL,
    ...(env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(","),
  ];
  const origins = candidates
    .map((c) => normalizeBaseUrl(c))
    .filter((u): u is string => Boolean(u))
    .map((u) => new URL(u).origin);
  return [...new Set(origins)];
}

/**
 * Better Auth configuration shared by the runtime (`auth.ts`) and tooling.
 * Auth tables live in the same Neon database under `auth_*` names with UUID ids,
 * so `auth_users.id` is the owner id stored on every financial record.
 */
export function authOptions(pool: Pool) {
  return {
    appName: "MyFinance",
    database: pool,
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: normalizeBaseUrl(process.env.BETTER_AUTH_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL),
    trustedOrigins: trustedOrigins(),
    telemetry: { enabled: false },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      // Private app: registration is closed unless explicitly opened for setup.
      disableSignUp: process.env.ALLOW_SIGNUP !== "true",
      autoSignIn: true,
    },
    user: { modelName: "auth_users" },
    session: {
      modelName: "auth_sessions",
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Signed session copy in a cookie: avoids a database lookup on every page.
      // Sign-out elsewhere takes effect within this window.
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    account: { modelName: "auth_accounts" },
    verification: { modelName: "auth_verifications" },
    rateLimit: { enabled: true, window: 60, max: 30, storage: "database", modelName: "auth_rate_limits" },
    advanced: {
      database: { generateId: "uuid" },
      useSecureCookies: process.env.NODE_ENV === "production",
      cookiePrefix: "myfinance",
    },
  } satisfies BetterAuthOptions;
}
