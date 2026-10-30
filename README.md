# MyFinance

Private personal-finance tracker for Thai baht: accounts, transactions, debts, monthly snapshots and
historical reports. Data lives in **Neon PostgreSQL** with row-level security; the app is a **PWA you can
install on iPhone** from Safari.

- Requirements & status: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md)
- Deploy (Neon + Vercel) and install on iPhone: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)
- Backups: [`docs/BACKUP_AND_RESTORE.md`](docs/BACKUP_AND_RESTORE.md)

## Stack

Next.js 15 · TypeScript · Tailwind CSS 4 · shadcn/ui-style components · PostgreSQL (Neon) · Better Auth ·
Zod · Zustand · Recharts · Vitest · Playwright

## Key design rules

- **Money** is `bigint` integer satang (1 THB = 100 satang). Liabilities carry negative balances.
- **Dates**: business dates are `date` in the Asia/Bangkok calendar; timestamps are `timestamptz`, displayed in Bangkok time.
- **Security**: every query runs through `withUserTransaction()` (`src/lib/db.ts`), which switches to the
  `myfinance_app` role (no `BYPASSRLS`) and binds `app.user_id`; RLS policies on every table do the rest.
  The browser never talks to the database.
- **History**: nothing financial is hard-deleted. Edits are audited with reasons; snapshots are immutable and
  only superseded by explicit rebuilds.

## Project layout

```
db/migrations/        SQL migrations (schema, RLS, triggers)
scripts/migrate.ts    migration runner (checksums, advisory lock)
src/lib/server/       data access: accounts, transactions, snapshots, reports, backup, exports
src/lib/              money, dates, validation (Zod), auth, db
src/app/(app)/        authenticated pages + server actions
src/app/api/          auth, exports, backup verify/restore
tests/unit, tests/db  Vitest (db tests need TEST_DATABASE_URL)
tests/e2e             Playwright on an iPhone viewport
```

## Local development

Needs Node 20+ and PostgreSQL 15+ (or a Neon branch).

```bash
cp .env.example .env   # fill in DATABASE_URL, BETTER_AUTH_SECRET; ALLOW_SIGNUP=true for the first run
```

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run dev
```

### Tests

```bash
npm run test:unit
```

Database tests reset the target databases — never point them at real data:

```bash
TEST_DATABASE_URL=postgres://…/myfinance_test TEST_SCRATCH_DATABASE_URL=postgres://…/myfinance_scratch npm test
```

```bash
npm run build && E2E_DATABASE_URL=postgres://…/myfinance_e2e npm run test:e2e
```
