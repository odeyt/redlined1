# The second Supabase project

## Why

There is one database. `staging.redlined1.com` runs the `staging` branch against
the same Supabase project as production, so "staging" today means new code
against real customer records. Every verification in the last several sessions
has meant touching production, and the E2E suite can only run there behind an
`ALLOW_PROD_E2E=true` override that exists because the alternative is worse.

A second project separates *the code being tested* from *the data that matters*.
After this, staging is genuinely staging, and the test suite creates and
destroys tenants freely without anyone weighing the blast radius first.

## What only you can do

Three of these steps need an account holder. They cost money, they change
outward-facing configuration, and they involve credentials that should not pass
through a transcript.

### 1. Create the project

supabase.com → d1group → **New project**

| Field | Value |
|---|---|
| Name | `redlined1-staging` |
| Region | same as production, so latency behaves comparably |
| Plan | Free is enough to start; it pauses after a week idle, which is a nuisance rather than a risk |

Save the database password somewhere durable — it is shown once, and the clone
step needs it. Do not paste it into this conversation.

### 2. Clone the schema

Both connection strings come from Settings → Database → Connection string (URI).

```bash
export PROD_DB_URL='postgresql://postgres.ldjrlvjkmzrcdqhetqoh:...@...:5432/postgres'
export STAGING_DB_URL='postgresql://postgres.NEWREF:...@...:5432/postgres'
bash scripts/clone-schema-to-staging.sh
```

The script dumps **schema only** — no customers, no vehicles, no invoices. It
refuses to run if the target is the production ref, and refuses to apply a dump
that contains no RLS policies.

Then prove it matched, rather than trusting that it applied without error:

```bash
psql "$PROD_DB_URL"    -f scripts/verify-schema-parity.sql
psql "$STAGING_DB_URL" -f scripts/verify-schema-parity.sql
```

The two outputs should agree on every count except the row counts at the end,
where staging should be empty. Pay attention to the *tables with RLS disabled*
list: a policy that failed to copy is bad, but a table whose RLS switch is off
enforces nothing while every policy on it still looks present.

```bash
psql "$STAGING_DB_URL" -f scripts/seed-staging-buckets.sql
```

Buckets are rows, not schema, so the dump does not carry them. Without this,
every photo upload fails at runtime days later.

### 3. Point staging at it

Vercel → redlined1 → Settings → Environment Variables, scoped to the `staging`
branch only:

```
NEXT_PUBLIC_SUPABASE_URL       https://NEWREF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  <staging anon key>
SUPABASE_SERVICE_ROLE_KEY      <staging service role key>
NEXT_PUBLIC_APP_ENV            staging
NEXT_PUBLIC_BILLING_ENABLED    false
```

`NEXT_PUBLIC_BILLING_ENABLED=false` matters more than it looks. Staging shares
the Creem configuration otherwise, and a checkout triggered from a test run
against live products is a real charge to a real card.

Redeploy the `staging` branch afterwards — environment variables are read at
build time, so an existing deployment keeps pointing at production until it is
rebuilt.

## Then, no accounts exist

A schema dump carries no `auth.users`. Sign up on `staging.redlined1.com` as you
would a new customer. That is not a workaround — it exercises the provisioning
path end to end, which is where the duplicate-shop bug lived, and it means the
first thing the new project proves is that signup works.

## Pointing local dev at it

```bash
cp .env.development.local.example .env.development.local
# fill in the staging values
```

Next.js precedence means `.env.development.local` overrides `.env.local` for
`next dev` only, so builds and scripts keep using production values. Delete the
file to point local dev back.

`tests/helpers/db-target.ts` already refuses to seed test data when it sees the
production ref. Once local dev resolves to the new project, the local suite runs
without `ALLOW_PROD_E2E` and without anyone thinking about blast radius.

## What stays pointed at production, deliberately

`npm run test:audit` targets production and reads the live audit trail. It is
read-only by design and should stay that way — its job is to confirm what is
actually recorded in the database people rely on, and running it against an
empty staging database would prove nothing while appearing to pass.

## What this does not solve

The two projects drift. Every migration from here has to be applied to both, and
nothing in this setup enforces that. The honest sequence is: apply to staging,
verify there, then apply to production — which is what the migrations were
supposed to be for all along, and what having one database made impossible.
