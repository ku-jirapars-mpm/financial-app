# Backup and restore

Keep **at least two independent copies** of your data: one managed by Neon, one you hold yourself.

> CSV exports are for spreadsheets. They are **not** a complete backup: they omit accounts' metadata,
> reconciliations, snapshots, debts and the audit history. Use the JSON backup or a database dump.

## 1. In-app full backup (recommended monthly)

**Backup & export → Full backup (JSON)** downloads every record you own: profile, categories, accounts,
cards, statements, loans, installment plans and payments, transactions (including soft-deleted ones),
debt payments, reconciliations, recurring transactions, budgets, snapshots and the audit history.

The file contains:
- `schema_version` — the last applied migration
- `integrity.row_counts` — rows per table
- `integrity.account_balances` — every account balance at export time
- `integrity.checksum` — SHA-256 over the canonical JSON of the data

Store it somewhere private (encrypted disk, password manager attachment, encrypted cloud folder).
It contains all your financial information.

### Checking a backup

**Backup & export → Restore from backup → Check integrity** validates the format, checksum, row counts and
duplicate ids without writing anything.

### Restoring

1. Sign in to an account that has **no accounts, transactions or snapshots** (e.g. after recreating the
   database, sign up again with `ALLOW_SIGNUP=true`).
2. **Restore from backup → Restore**.

The restore runs in one database transaction: it re-checks integrity, inserts everything with fresh ids
(re-linking all references), re-applies account status (closed/archived), re-inserts the audit history, and
finally recomputes every account balance and compares it with the backup. Any mismatch or error rolls the
whole restore back.

## 2. Neon-managed protection

- **Point-in-time restore:** Neon keeps WAL history for your plan's retention window. In the console:
  *Branches → main → Restore*, choose a timestamp. Restore into a new branch first to inspect it.
- **Branches as snapshots:** before risky changes (e.g. a migration), create a branch of `main`. It is an
  instant, copy-on-write snapshot you can return to.

## 3. Database dump you keep yourself

Use the **direct** (non-pooled) connection string of the Neon owner role (it has `BYPASSRLS`, which `pg_dump`
needs to read every row) and a `pg_dump` at least as new as the server version.

```bash
pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --no-owner --file="myfinance-$(date +%F).dump"
```

Restore into an **empty** database (e.g. a new Neon project or branch). Roles are not part of a dump, so
create the application role first — the dump's GRANT statements refer to it:

```bash
psql "$NEW_DATABASE_URL_UNPOOLED" -c "create role myfinance_app nologin noinherit nobypassrls; grant myfinance_app to current_user;"
```

```bash
pg_restore --no-owner --dbname="$NEW_DATABASE_URL_UNPOOLED" "myfinance-2026-10-31.dump"
```

Check the restore:

```bash
psql "$NEW_DATABASE_URL_UNPOOLED" -c "select name from schema_migrations order by name"
```

```bash
psql "$NEW_DATABASE_URL_UNPOOLED" -c "select count(*) from transactions"
```

## Suggested routine

| When | What |
|---|---|
| Month end | Take a snapshot in the app, then download the full JSON backup |
| Quarterly | `pg_dump` to an encrypted location and test `pg_restore` into a scratch branch |
| Before migrations | Create a Neon branch |
