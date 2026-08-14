# Deploying

Nothing reaches production without being seen working on staging first.

This exists because on 2026-08-13 a component was mounted in the app shell,
pushed straight to `main`, and took production down for signed-in users. The
build passed, the types passed, 1484 tests passed. None of them open the app.

## The flow

```
work on staging  →  push  →  Vercel builds a preview  →  YOU open it and use it
                                                       →  only then merge to main
```

1. **Work on `staging`.** Never commit to `main` directly.
2. **Push it:** `git push origin staging`
3. **Open the preview** (below) and actually use the screens you changed —
   sign in, click through, watch for the error boundary.
4. **Only then merge:**
   `git push origin staging:main`

## The preview URL

```
https://redlined1-git-staging-redlined1-s-projects.vercel.app
```

Stable — it always points at the newest `staging` commit, so it does not change
between deploys.

It is behind Vercel Deployment Protection, so it opens only for someone signed
in to the Vercel account. That is deliberate: a preview runs against the real
database and should not be publicly reachable.

Confirm you are on the build you think you are:

```
https://redlined1-git-staging-redlined1-s-projects.vercel.app/api/ping
```

`commit` should match the `staging` HEAD.

## What staging does and does not protect

**Catches** what tests cannot: a screen that throws on render, a layout broken
on a phone, a control that does nothing, a workflow that reads wrong. Every
production fault this month was one of these.

**Does not catch** anything about data, because **the preview points at the
production database**. There is one Supabase project. So:

- treat anything you do on staging as real — it is
- a migration applied for staging is applied for production, immediately
- do not use staging to try out deletions or bulk edits

A separate staging database is the missing half. It needs a schema baseline the
repo does not have: 80-odd migration files, and not one `CREATE TABLE` for
`repair_orders`, `invoices`, `customers` or `vehicles`. Until that exists,
staging is a code safety net only, and that is worth being honest about.

## Migrations

Still run by hand in the Supabase SQL editor, and still the riskiest step:

- **check the project selector reads `redlined1`** — `d1express-dev` sits next
  to it in the list and a statement has already gone to the wrong one
- run one file per tab; the editor executes a tab as a single transaction, so
  one failure silently rolls back everything else in it
- "Success. No rows returned" is not verification. Query the thing you changed
- after adding a column, PostgREST rejects writes naming it for a minute or two
  (`PGRST204`). `NOTIFY pgrst, 'reload schema';` ends the wait
