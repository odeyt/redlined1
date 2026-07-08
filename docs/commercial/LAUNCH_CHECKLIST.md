# Commercial Launch Checklist

## Phase 1 — Infrastructure (Complete)
- [x] `commercial/` folder structure created
- [x] Database migration written (`migration_commercial_billing.sql`)
- [x] Types defined (`commercial/shared/types.ts`)
- [x] Plan manager created (`commercial/plans/planManager.ts`)
- [x] Subscription service created
- [x] License service created (fail-safe)
- [x] Usage service created
- [x] Billing provider interface defined
- [x] Creem provider implemented (with TODO markers)
- [x] Billing service created (single entry point)
- [x] API routes created (status, plans, usage, webhook)
- [x] Billing dashboard UI created
- [x] Feature flags defined (all disabled by default)
- [x] Onboarding hook created
- [x] Public pricing data created
- [x] Documentation written

## Phase 2 — Creem Configuration (Manual)
- [ ] Create Creem account
- [ ] Create 3 products (Starter, Professional, Business)
- [ ] Create monthly + annual prices for each
- [ ] Add env vars to Vercel (staging first)
- [ ] Configure webhook endpoint in Creem
- [ ] Copy webhook secret to Vercel

## Phase 3 — Staging Verification
- [ ] Run database migration on staging Supabase
- [ ] Deploy staging with env vars
- [ ] Test checkout flow end-to-end
- [ ] Verify webhook received and `billing_events` row created
- [ ] Verify `shop_subscriptions` updated after checkout
- [ ] Test billing portal link
- [ ] Enable `NEXT_PUBLIC_BILLING_ENABLED=true` on staging
- [ ] Test billing disabled state (shows safe message)

## Phase 4 — Production Launch
- [ ] Run database migration on production Supabase
- [ ] Add all env vars to Vercel production
- [ ] Update Creem webhook URL to production domain
- [ ] Set `NEXT_PUBLIC_BILLING_ENABLED=true` in production
- [ ] Enable feature flags in production DB:
  - [ ] `commercial_billing`
  - [ ] `trial_system`
  - [ ] `billing_portal`
- [ ] Monitor `billing_events` table for 24h
- [ ] Monitor `shop_subscriptions` table

## Phase 5 — Enforcement (Last Step)
- [ ] Verify at least 5 successful payments in production
- [ ] Enable `subscription_enforcement` feature flag
- [ ] Test that plan limits are enforced correctly
- [ ] Verify D1 internal shop is NOT blocked

## Emergency Rollback
To immediately disable all billing enforcement:
```
NEXT_PUBLIC_BILLING_ENABLED=false
```
Redeploy. Zero impact on existing repair-shop workflows.
