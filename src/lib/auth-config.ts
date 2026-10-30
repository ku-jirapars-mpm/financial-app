import type { BetterAuthOptions } from "better-auth";
import type { Pool } from "pg";

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
    baseURL: process.env.BETTER_AUTH_URL,
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
