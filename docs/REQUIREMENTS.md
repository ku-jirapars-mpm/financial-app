# MyFinance — Requirements (v2: persistent database & financial history)

Status legend: ✅ implemented · 🟡 partial (schema/backend done, UI pending) · ⏳ planned

## 0. Adaptations to the requested plan

The original brief specified Supabase (PostgreSQL + Auth + migrations). It was
then changed to **"DB using Neon, and the app should be installable from the
website on iPhone."** The plan is adapted as follows; every security
requirement from the brief is kept.

| Brief | Implemented as | Why |
|---|---|---|
| Supabase PostgreSQL | **Neon serverless PostgreSQL** | As requested. Neon is plain Postgres 16/17, so RLS, triggers and constraints work unchanged. |
| Supabase Auth | **Better Auth** (email + password), tables in the same Neon DB (`auth_*`) | Supabase Auth is tied to Supabase's Postgres. Better Auth runs inside the Next.js server, stores UUID user ids, has rate limiting and secure cookies, and needs no extra service. |
| Supabase RLS via `auth.uid()` | RLS policies on `app.current_user_id()`; every request runs `SET LOCAL ROLE myfinance_app` + `set_config('app.user_id', …)` inside one transaction | Neon's owner role has `BYPASSRLS`; switching to a role without it guarantees policies always apply. |
| Supabase migrations | Plain SQL files in `db/migrations`, applied by `scripts/migrate.ts` (checksums, advisory lock, one transaction per migration) | Portable; no Supabase CLI. |
| Supabase client in the browser | **No database access from the browser at all.** All reads/writes are server components, server actions or route handlers. | Removes the service-role-key risk entirely. |
| Native/App Store app | **Installable PWA** (manifest, iOS meta tags, icons, safe-area layout, minimal service worker). Install from Safari → Share → *Add to Home Screen*. | No App Store needed. |
| IndexedDB | Not used. The service worker caches only static build assets; financial data is never stored on the device. | Database is the single source of truth. |

The repository was empty when this work started, so there was no existing code to keep or remove.

## 1. Architecture ✅

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4 + shadcn/ui-style components (`src/components/ui`)
- Neon PostgreSQL via `pg` (server only), Zod validation, Zustand (UI preferences only), Recharts
- Vitest (unit + database integration) and Playwright (end-to-end on an iPhone viewport)
- Secrets only in environment variables (`.env.example`); nothing prefixed `NEXT_PUBLIC_`.

## 2. Security and data isolation ✅

- Authentication required: middleware redirects, and every page/action/route calls `requireUser()` server-side.
- RLS enabled **and forced** on all 15 user-owned tables (test: `tests/db/migrations.test.ts`).
- Every financial row has `owner_id` (default = authenticated user; immutable).
- Cross-table references use composite `(owner_id, id)` foreign keys — a row can never reference another user's row.
- App DB role has no `DELETE` on financial tables, no access to auth tables, and cannot edit audit logs.
- Inputs validated with Zod before any write; DB check constraints validate again.
- Error logs contain only error codes, never amounts or descriptions.
- No analytics; Better Auth telemetry explicitly disabled; nothing sent to AI services.
- Sign-up closed by default (`ALLOW_SIGNUP=false`).
- Security headers (HSTS, frame denial, no-referrer, nosniff); `robots: noindex`.

## 3. Persistent financial history

| Requirement | Status |
|---|---|
| Search/filter transactions by text, account, category, type, date range | ✅ `/transactions` |
| Show original transaction date, created and modified timestamps, version | ✅ transaction detail |
| Field-level change history with reasons | ✅ audit trail on every financial table |
| Relationships transactions ↔ accounts / loans / statements / installment plans | ✅ schema (FKs); loan/statement/installment UI ⏳ Phase 2 |
| `financial_snapshots` table with all requested fields + `calculation_version`, `assumptions`, `metadata` | ✅ |
| Manual snapshot generation | ✅ `/snapshots` |
| Monthly summary view and trend charts | ✅ `/reports`, `/snapshots` |
| Recorded vs reconstructed estimates clearly distinguished | ✅ `data_basis` column + badges + warnings |

## 4. Preserving records ✅

- Accounts: archive / close / reopen with reason; never deleted; history stays visible.
- Closed/archived accounts are frozen (DB trigger) until reopened.
- Transactions: soft delete with reason, restore; deleted rows cannot be edited.
- Reconciliation events are append-only, with statement vs recorded balance, difference and reason.
- Snapshots are immutable (trigger). The only allowed change is marking one as superseded by an explicit **rebuild**, which inserts a new row and keeps the old one.
- Hard deletes of financial records are blocked by triggers even for the table owner.

## 5. Database design ✅

Tables: `profiles, accounts, categories, transactions, credit_cards, credit_card_statements, loans,
installment_plans, installment_payments, debt_payments, recurring_transactions, budgets,
financial_snapshots, audit_logs` + `reconciliations` (added for reconciliation events) + Better Auth `auth_*`.

- UUID primary keys everywhere.
- Money: **`bigint` integer satang** (1 THB = 100 satang). Parsed from text without floating point (`src/lib/money.ts`). Balance sign: positive = asset, negative = owed.
- Dates: business dates are `date` in the Asia/Bangkok calendar; instants are `timestamptz`. Display always in Asia/Bangkok.
- Requested indexes: `(owner_id, transaction_date)`, `(account_id, transaction_date)`, `(owner_id, snapshot_date)`, `(account_id, statement_date)`, `(installment_plan_id, payment_date)`.
- Transfers and debt payments: two legs sharing `transfer_group_id`; a deferred constraint trigger requires exactly two live legs in different accounts summing to zero.
- Multi-record operations run in one DB transaction (`withUserTransaction`).

## 6. Historical reporting

| Report | Source | Status |
|---|---|---|
| Monthly income and expenses | transactions | ✅ |
| Monthly net cash flow | transactions (cash/e-wallet/bank) | ✅ |
| Monthly closing cash balance | snapshots | ✅ |
| Monthly outstanding debt | snapshots | ✅ |
| Credit card debt by account | per-account balances stored in snapshot metadata | ✅ |
| Installment obligations by month | installment_payments | ✅ (needs Phase 2 data entry) |
| Debt repayment progress | debt_payments + balances | ✅ |
| Interest and fees paid | fee/interest transactions + payment breakdowns | ✅ |
| Net financial position over time | snapshots | ✅ |
| Compare any two periods | transactions | ✅ |

Balance-type history is **never** silently reconstructed from transactions: those charts use snapshots, and back-dated snapshots are labelled *reconstructed estimate* with warnings.

## 7. Backup and export ✅

- Full JSON backup of every user-owned table incl. audit history, with SHA-256 checksum, row counts and per-account balances.
- CSV transactions, CSV monthly report, JSON debts & installment plans.
- Integrity check of a backup file without restoring.
- Restore: validated, single transaction, only into an empty profile, ids remapped, balances re-verified (rollback on mismatch).
- `docs/BACKUP_AND_RESTORE.md` covers database-level backups (Neon PITR/branches, `pg_dump`). The UI states that CSV is not a complete backup.

## 8. Reliability tests ✅

`tests/db/*` against a real PostgreSQL: multi-record atomicity and rollback, concurrent duplicate submissions,
idempotency keys, optimistic concurrency / concurrent edits, edit & soft-delete of transfers,
snapshot immutability and rebuild, RLS ownership, migration safety (checksums, rollback), backup
tamper detection and restore, reconciliation, debt balances. `tests/e2e` runs the real app on an iPhone viewport.

## 9. Implementation phases

- **Phase 1 — done:** database, migrations, auth, RLS, accounts, categories, transactions, dashboard, persistence tests, PWA.
- **Subscriptions — done:** recurring expenses (Netflix, Spotify…) with monthly/yearly totals, upcoming charges on Overview, one-tap idempotent "Record" that posts the expense and advances the schedule (anchored to the start day, no month-end drift), skip, price changes, pause/resume/cancel with history kept. Charges are confirmed by the user, not auto-posted.
- **Credit cards — done:** credit limit (วงเงิน), used (ใช้ไป) and available (คงเหลือ) with a usage bar; statement day (วันตัดบัตร) and payment due day (วันชำระวันสุดท้าย) with next dates and countdown; estimated amount due = owed at last statement close minus payments since, with minimum payment; due bills (≤7 days or overdue) shown on Overview with a Pay shortcut.
- **Phase 2 — partially done:** schema for credit cards, statements, loans, installments, debt payments; debt payments with interest/fee breakdown and reconciliation are live. ⏳ UI to create card terms, statements, loan terms and installment plans (with generated schedules), statement payment status, budgets.
- **Phase 3 — mostly done:** snapshots, historical reports, charts. ⏳ debt payoff simulations (avalanche/snowball).
- **Phase 4 — partially done:** full backup/restore with integrity checks. ⏳ "AI-ready" export package (explicit, user-initiated only), formal security/data-integrity audit.
