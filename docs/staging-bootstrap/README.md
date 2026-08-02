# Staging bootstrap — run this yourself, report results back

I can't run any of the steps below myself: they all require a Postgres
database password or a Supabase account login, and I don't handle
credentials — not even with permission. Everything here runs in **your**
terminal / **your** browser. Paste back non-sensitive output (row counts,
"Success" messages, error text) and I'll help interpret it or fix
anything that breaks — never paste a password or connection string back
to me.

**What this produces:** a brand-new `redlined1-staging` Supabase project
with the exact schema production has right now (via a schema-only dump —
no customer data), plus the 11 security-remediation migrations that have
been sitting drafted-but-unapplied since 2026-07-20/21 (see
[[project_redline_live_vuln]] in memory) applied fresh to staging, plus
one synthetic test shop. Nothing here touches production. Nothing here
requires GitHub/PR review — it's local database setup only.

**Why apply the drafted remediation to staging first:** those 11 files
close real, still-open holes (unrestricted `shops`/`shop_users` reads,
`profiles`/`technicians` platform-wide read, ~18 tables with RLS
completely off, a self-role-escalation bug). Staging is the correct place
to validate they work before ever considering applying them to
production — that's a separate decision for later, not part of this.

---

## 0. One-time tools check

You already have the Supabase CLI (`npx supabase --version` → confirmed
`2.109.1` in this environment). No separate `psql`/`pg_dump` install
needed — the commands below use `npx supabase db dump`/`db push`, which
bundle their own Postgres client.

## 1. Create the staging project (skip if you already did this)

1. [supabase.com](https://supabase.com) → **New Project**.
2. Name: **`redlined1-staging`** exactly.
3. Organization: same one that owns your production `redlined1` project.
4. Region: match production's region (Supabase dashboard → your prod
   project → Settings → General → Region).
5. Set a database password — **use a password manager, don't send it to
   me, and if you ever paste it into this chat by accident, treat it as
   burned and reset it immediately** (this has happened a few times this
   session already).

Tell me once it exists — I don't need the credentials, just confirmation,
so I know which step to pick up at if we continue in a later message.

## 2. Get both connection strings ready (in your own notes, not in chat)

For each project (production **read-only** here, staging read/write):
Supabase dashboard → your project → **Settings → Database → Connection
string → URI**. Keep both handy for the commands below — you'll paste
the password into your own terminal when prompted, never here.

## 3. Clone the schema (no data) from production to staging

In **your own PowerShell terminal**, from `C:\Users\wallyd1\REDLINE`:

```bash
npx supabase db dump --db-url "<PRODUCTION_CONNECTION_STRING>" --schema public -f docs/staging-bootstrap/00_baseline_schema.sql
```

This is read-only against production (a `dump`, never a `push`) and
schema-only (no rows) — safe. You'll be prompted for the production DB
password; paste it there, not in this chat.

Then apply that schema to the **empty** staging project:

```bash
npx supabase db push --db-url "<STAGING_CONNECTION_STRING>" --include-all
```

Wait — `db push` expects a `supabase/migrations/` folder, and
`docs/staging-bootstrap/` isn't that. Simplest path: temporarily copy the
dumped file into place before pushing, then move it back out so it
doesn't get mixed into the repo's real migration history:

```bash
cp docs/staging-bootstrap/00_baseline_schema.sql supabase/migrations/00000000000001_staging_baseline.sql
npx supabase db push --db-url "<STAGING_CONNECTION_STRING>" --include-all
rm supabase/migrations/00000000000001_staging_baseline.sql
```

Report back: did it say something like `Applying migration
00000000000001_staging_baseline.sql...` and finish without error?

## 4. Apply the 11 security-remediation files, in order

These are already extracted and numbered in `docs/staging-bootstrap/`
(`00_...` through `10_...`), pulled from the already-reviewed
`feat/platform-foundation` branch (see `STAGING_MIGRATION_MANIFEST.md`
there for the full per-file rationale — not reproduced here to keep this
short). Same copy-in/push/copy-out pattern, one command:

```bash
for i in docs/staging-bootstrap/0*.sql docs/staging-bootstrap/1*.sql; do
  n=$(basename "$i")
  cp "$i" "supabase/migrations/00000000000002_$n"
done
npx supabase db push --db-url "<STAGING_CONNECTION_STRING>" --include-all
rm supabase/migrations/00000000000002_*
```

Report back: any error output. **File #9
(`09_close_profiles_role_escalation_gap.sql`) and #8
(`08_resolve_migration_conflicts.sql`) must both apply — if the run stops
partway through, tell me exactly which filename it stopped at.**

## 5. Create the storage bucket

Dashboard (staging) → **Storage → New bucket** → name exactly
`shop-assets` → **Public bucket: ON** (matches production's current
config — yes, production's bucket being public is itself a known
deferred issue, see `SHOP_ASSETS_PRIVATE_MIGRATION_PLAN.md` on
`feat/platform-foundation`; staging matching it for now keeps behavior
consistent with what you're testing against). File #6
(`06_storage_policies.sql`, already applied in step 4) adds the RLS
policies scoping who can write into it.

## 6. Create one test login + shop

1. Dashboard (staging) → **Authentication → Users → Add User** — pick any
   email/password, confirm the email if it asks.
2. Copy the **User UID** shown for that new user.
3. Open `docs/staging-bootstrap/seed_test_shop.sql`, replace
   `<TEST_USER_ID>` (both places) with that UID, paste the whole file
   into the staging **SQL Editor**, run it.
4. It ends with a `select` — should return exactly one row: your test
   shop's id, name, and role `owner`. Paste that row back to me (it's not
   sensitive) so I know this step succeeded.

You now have a login you can sign into from the mobile app.

## 7. Point the mobile app at staging

In `C:\Users\wallyd1\REDLINE MOBILE\mobile-app`, create `.env` (copy from
`.env.example` if you don't have one yet) with:

```
EXPO_PUBLIC_APP_ENV=staging
EXPO_PUBLIC_SUPABASE_URL=<staging project URL, Settings → API>
EXPO_PUBLIC_SUPABASE_ANON_KEY=<staging anon/public key, same page>
EXPO_PUBLIC_API_URL=https://www.redlined1.com
```

The anon key is safe to put here — it's public by design, same exposure
model as the URL itself. **Do not use the service_role key anywhere in
this app.**

**Known limitation:** `EXPO_PUBLIC_API_URL` still points at the
production web app because there's no staging deployment of
`redlined1.com` (that's a separate, bigger task — a new Vercel
project/env, not requested here). That means Job Card **stage-advance**
(the one existing Phase 2 mutation, `POST /api/job-status`) won't work
against a staging shop — it'll 404/403 since production's API only knows
about production's database. This doesn't block what you actually want
to test: VIN scan → create vehicle, and Job Card photo upload both talk
to Supabase directly from the app, not through that API route, so they
work fully against staging as configured above.

## 8. Run it

```bash
cd "C:\Users\wallyd1\REDLINE MOBILE\mobile-app"
npx expo start
```

Scan the QR code with Expo Go (or run `--android`/`--ios` for a
simulator), sign in with the test login from step 6, and you should see
a **STAGING** badge in the corner and your `D1 Staging Test Shop`. Try
Vehicles → **+ Scan VIN** → manual VIN entry (any 17-char VIN, or a real
one) → Save Vehicle, and a Job Card → **Take Photo**/**Choose Photo**.

---

Tell me where you land — which step number, and any error text (not
credentials) — and I'll help from there.
