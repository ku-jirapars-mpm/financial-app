/**
 * node-postgres currently treats sslmode=require/prefer/verify-ca as verify-full
 * and warns that v9 will weaken them to libpq semantics. Pin verify-full so the
 * connection keeps full certificate + hostname verification (Neon supports it).
 */
export function withStrictSsl(connectionString: string): string {
  return connectionString.replace(/([?&]sslmode=)(prefer|require|verify-ca)(?=&|$)/i, "$1verify-full");
}
