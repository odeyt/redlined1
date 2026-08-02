# Creem sandbox test — setup

Goal: prove a purchase end-to-end (checkout → webhook → plan activates) with
no real money and **no change to the live site**.

Isolation: every Creem variable is currently scoped **Production only**. All
test credentials go on **Preview only**. Production is never edited, so the live
site cannot be put into sandbox mode by accident.

Deploys from the `billing-sandbox` branch.

---

## Before you start — two things that will bite

**1. The test account must not be exempt from billing.**
`app/api/billing/checkout/route.ts` returns 403 for the platform owner email,
for any address in `BILLING_EXEMPT_DOMAINS`, for internal shop IDs, and for
technicians. Your own admin address is almost certainly exempt. Use a separate
signup that is none of those, with an **owner or manager** role.

**2. Preview shares the production database.**
`NEXT_PUBLIC_SUPABASE_URL` is scoped to Preview and Production alike, so the
sandbox writes to real tables. That is deliberate — it is what proves activation
really works — but it means the test account is a real row. Use a dedicated
account, not a customer's.

Rows touched: `profiles.plan` for the test user, plus one
`shop_subscriptions` row and one `billing_events` row for its shop.

---

## Step 1 — collect test credentials from Creem

In the Creem dashboard, switch to **test mode**. These are different objects
from your live ones and cannot be mixed:

| Need | Where | Looks like |
|---|---|---|
| Test API key | Developers → API keys | `creem_test_…` |
| Test product ID | Products → your cheapest plan | `prod_…` |
| Test webhook secret | Developers → Webhooks | `whsec_…` |

A live key against the sandbox host fails with an opaque 401, which is why
`/api/billing/env-check` reports `testModeMatchesKey`.

## Step 2 — register the webhook endpoint

Point the **test-mode** webhook at the preview branch URL:

```
https://redlined1-git-billing-sandbox-<your-team>.vercel.app/api/billing/webhook/creem
```

The exact host is on the preview deployment in Vercel. Use the **branch** alias,
not the per-commit URL — the per-commit one changes on every push.

Subscribe to at least: `checkout.completed`, `subscription.created`,
`subscription.active`.

**Deployment Protection must be off for this URL.** Vercel protects preview
deployments behind an auth wall by default, and Creem's POST will be bounced
with an HTML login page — which looks exactly like a broken webhook. Either
disable protection for preview, or add a protection-bypass token.

## Step 3 — add the variables, scoped to Preview only

Add these in **Vercel → redlined1 → Settings → Environment Variables**, with
**only the Preview checkbox ticked**. Add them in the dashboard rather than
pasting values into a terminal or a chat, so the secrets stay out of logs and
transcripts.

| Variable | Value |
|---|---|
| `CREEM_TEST_MODE` | `true` — already exists on Preview; confirm the value |
| `CREEM_API_KEY` | your `creem_test_…` key |
| `CREEM_WEBHOOK_SECRET` | the **test** webhook secret |
| `NEXT_PUBLIC_BILLING_ENABLED` | `true` |
| `BILLING_PROVIDER` | `creem` |
| `PAYMENT_PROVIDER` | `creem` |
| `CREEM_SOLO_MONTHLY_PRODUCT_ID` | test product id for the plan you'll buy |
| `CREEM_SUCCESS_URL` | `https://<preview-host>/app?billing=success` |
| `CREEM_CANCEL_URL` | `https://<preview-host>/app?billing=canceled` |
| `PLATFORM_OWNER_EMAIL` | your admin address — keeps the env-check endpoint reachable |

Do **not** add `NEXT_PUBLIC_ENFORCE_PLAN_LOCK`. Absent means no lockout, which
matches production.

Redeploy the branch after adding them — Vercel bakes `NEXT_PUBLIC_*` at build
time, so existing deployments will not pick them up.

## Step 4 — confirm the wiring before paying

Signed in as the platform owner on the preview URL:

```
/api/billing/env-check
```

Required: `apiKeyIsTestKey: true`, `testMode: true`,
`testModeMatchesKey: true`, `apiBaseUrl: https://test-api.creem.io/v1`,
`webhookSecretConfigured: true`.

If `testModeMatchesKey` is false, stop — checkout will fail with an opaque 401.

## Step 5 — buy the plan with a test card

Creem's sandbox accepts `4242 4242 4242 4242`, any future expiry, any CVC.

## Step 6 — what to check afterwards

In order, because each explains a different failure:

1. **Vercel logs**, filtered to `[webhook/creem]`. Silence here means Creem never
   reached the endpoint — wrong URL, or Deployment Protection.
   - `REJECTED — signature did not verify` → compare the logged received vs
     expected values; a format difference identifies the scheme.
   - `cannot resolve a shop` → the test user has no `shop_users` row.
   - `no plan in metadata` → the plan defaulted; the buyer got professional.
2. **`billing_events`** — a row means the event arrived and passed verification.
   `processed = true` means the whole handler ran.
3. **`shop_subscriptions`** — `status = 'active'`, and `plan_key` matching what
   was actually bought, not `professional`.
4. **`profiles.plan`** for the test user — this is what `usePlan()` reads and
   what the customer experiences.
5. **The app itself** — reload; previously gated modules should open.

## Step 7 — tear down

Delete the Preview-scoped variables, or leave them for future testing. They
cannot affect production either way. Reset the test account's `plan` if you
want it back on free.

---

## What this does and does not prove

Proves: signature verification, the metadata contract between checkout and
webhook, plan mapping, subscription upsert, and that the app unlocks. Every bug
found on 2026-08-02 was in this category.

Does not prove: that the **live** API key, **live** product IDs, and **live**
webhook registration are correct — those are separate objects from their test
counterparts. Only a live purchase confirms those.
