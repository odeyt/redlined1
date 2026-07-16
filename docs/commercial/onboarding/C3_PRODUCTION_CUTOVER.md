# C-3 Production Cutover Checklist

**Date prepared:** 2026-07-16  
**Status:** NOT YET SCHEDULED — requires explicit owner approval  
**Branch:** `feature/commercial-signup-subscription-flow`

---

## Prerequisites (All Must Be Complete)

- [ ] Feature branch merged to main (separate approval)
- [ ] Supabase `onboarding_sessions` migration run on production project
- [ ] Production Creem account set up (live mode, not test)
- [ ] Live Creem product IDs created for each plan × interval (8 products)
- [ ] Production env vars set in Vercel (see below)
- [ ] Supabase auth email templates updated (see `AUTH_EMAIL_SETUP.md`)
- [ ] Supabase callback URL allowlist confirmed
- [ ] Full UAT on Creem sandbox completed
- [ ] UAT sign-off document complete

---

## Production Environment Variables

Set in Vercel → Production environment. Do NOT commit to git.

| Variable | Notes |
|----------|-------|
| `NEXT_PUBLIC_BILLING_ENABLED` | Set to `true` only when ready to accept payments |
| `CREEM_API_KEY` | Live mode API key — not test |
| `CREEM_WEBHOOK_SECRET` | Live webhook secret |
| `CREEM_SOLO_MONTHLY_PRODUCT_ID` | Live product IDs from Creem dashboard |
| `CREEM_SOLO_ANNUAL_PRODUCT_ID` | |
| `CREEM_STARTER_MONTHLY_PRODUCT_ID` | |
| `CREEM_STARTER_ANNUAL_PRODUCT_ID` | |
| `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | |
| `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` | |
| `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` | |
| `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` | |

---

## Database Migrations (Production Supabase)

Run in order via Supabase SQL Editor:

1. `supabase/migrations/20260716000000_add_onboarding_sessions.sql`  
   (from `C3_MIGRATION_RUNBOOK.md`)

2. If needed — `subscriptions` column additions:
   ```sql
   ALTER TABLE public.subscriptions
     ADD COLUMN IF NOT EXISTS selected_paid_plan text,
     ADD COLUMN IF NOT EXISTS trial_started_at timestamptz,
     ADD COLUMN IF NOT EXISTS converted_at timestamptz;
   ```

3. Verify RLS: `onboarding_sessions` is not accessible anonymously.

---

## Go-Live Steps

1. Confirm all prerequisites above are checked
2. Deploy main branch to production (Vercel)
3. Verify build successful
4. Set `NEXT_PUBLIC_BILLING_ENABLED=true` in Vercel production env
5. Redeploy (or wait for env propagation)
6. Run live smoke test:
   - Sign up with a real email on production
   - Confirm email → trial activates
   - Verify trial banner shows days remaining
7. Do NOT process a real payment until at least 24 h of monitoring

---

## Rollback Procedure

If issues arise within 24 h of go-live:

1. Set `NEXT_PUBLIC_BILLING_ENABLED=false` in Vercel → redeploy
2. All flows revert to disabled state (no billing, trial flow still works)
3. No data is lost — subscriptions table and onboarding_sessions intact
4. Investigate before re-enabling

---

## D1 Shop Impact

D1 internal shops (`38d55fae-…`, `90b72748-…`) are unaffected by this cutover:
- No billing prompts
- No trial expiry
- All modules remain accessible
- LAK conversion feature remains active

---

## Owner Sign-Off Required

This document is informational only. Production cutover must not proceed without explicit written approval from the owner via the project management channel.
