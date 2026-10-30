import { Client } from "pg";
import { migrate } from "../scripts/migrate";

/** Resets TEST_DATABASE_URL and applies all migrations. DB suites are skipped when it is unset. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("drop schema if exists public cascade; drop schema if exists app cascade; create schema public;");
  await client.end();
  await migrate(url, { log: () => undefined });
}
