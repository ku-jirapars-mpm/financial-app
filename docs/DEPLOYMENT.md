# Deploying MyFinance (Neon + Vercel) and installing it on iPhone

## Current production database

| | |
|---|---|
| Neon project | `myfinance` (id `red-firefly-59886881`), region AWS ap-southeast-1 (Singapore), Postgres 17 |
| Branch | `main` (production). Migrations `0001`–`0004` applied 2026-10-30 and verified (RLS forced on 15 tables, app role without BYPASSRLS, delete guards active). |
| Connection strings | Neon console → project `myfinance` → **Connect**. Never commit them. |

## 1. Create the Neon database (only for a new environment)

1. Sign in at <https://console.neon.tech> and create a project. Pick region **AWS Asia Pacific (Singapore)** (closest to Bangkok).
2. In **Connection Details** copy two strings:
   - the **pooled** connection string (host contains `-pooler`) → `DATABASE_URL`
   - the **direct** connection string → `DATABASE_URL_UNPOOLED` (used only for migrations)
3. Optional but recommended: **Settings → Storage → History retention** set to the maximum your plan allows (this is your point-in-time restore window).

## 2. Run the migrations

From your computer (Node 20+):

```bash
npm install
```

```bash
DATABASE_URL_UNPOOLED="postgresql://…direct…" npm run db:migrate
```

The runner applies `db/migrations/*.sql` in order, each in its own transaction, records a checksum per file,
and refuses to continue if an already-applied file was changed. It also creates the `myfinance_app` role that
every request switches to so Row Level Security always applies.

To try a migration safely first, create a Neon **branch**, run the migration against the branch's connection string, then run it on `main`.

## 3. Deploy the web app to Vercel

1. Push this repository to GitHub, then on <https://vercel.com/new> import it (framework: Next.js).
2. Add environment variables (Production):

| Variable | Value |
|---|---|
| `DATABASE_URL` | Neon pooled connection string |
| `BETTER_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | your site URL, e.g. `https://myfinance-yourname.vercel.app` |
| `ALLOW_SIGNUP` | `true` (only for the first deploy) |

3. Deploy. Open the site, go to `/signup` and create your account (password ≥ 12 characters).
4. Set `ALLOW_SIGNUP=false` and redeploy. Registration is now closed.

Any Node host works (Render, Fly.io, a VPS with `npm run build && npm start`) as long as it serves HTTPS.

## 4. Install on iPhone

1. Open your site in **Safari** on the iPhone (other browsers on iOS can't add web apps on older iOS versions).
2. Sign in.
3. Tap the **Share** button → **Add to Home Screen** → **Add**.
4. Launch MyFinance from the home screen icon. It opens full-screen without browser bars, like a native app.

Notes:
- The app needs a connection; it shows an offline screen otherwise. Financial data is never cached on the phone.
- Use the eye icon (top right) to blur amounts when using the app in public.
- Sessions last 7 days; you will be asked to sign in again after that.

## 5. Updating

```bash
DATABASE_URL_UNPOOLED="…" npm run db:migrate
```

Run migrations before (or as part of) deploying a new version. Migrations only ever add new files; never edit an applied one.
