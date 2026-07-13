# C-2.4 Release Manifest — Creem Sandbox Certification, Account-Review Gate, Controlled Live Cutover
**Date:** 2026-07-13
**Author:** Principal SaaS Billing Release Engineer
**Status:** PHASE 0 COMPLETE — Awaiting UAT execution

---

## 1. Branch State

| Branch | Status | Commits ahead of main | Notes |
|--------|--------|-----------------------|-------|
| `feature/creem-sandbox-certification` | Local only, not pushed | 5 commits | Contains all billing code |
| `feature/billing-health-dashboard` | Merged to main | 0 | C-2.2 already live |
| `main` | Production | — | 20+ commits ahead of creem branch's base |

### Divergence Point

`feature/creem-sandbox-certification` diverges from `main` at:
```
f2a27af feat(marketing): hover dropdowns on all 5 nav items with topic links
```

**Main has since added:**
- C-2.2 Billing Health Dashboard (`b2f39a9`, `8026482`, merged `9ec07bb`)
- Auth/invite flow fixes (`e3c83b4`, `705470b`)
- Forgot-password UI + email check (`88df8ba`, `705470b`)
- Sidebar platform-owner detection fixes (`de83056`, `b2147e1`, `b13f6c4`, `3a83d1a`, `285928e`)
- VIN auto-decode (`1d4df9c`)
- Photo drag-to-reorder fix (`b960b24`)
- Bulk import fixes (`019b062`, `cae81f8`)

**Required pre-merge action:** Merge `main` → `feature/creem-sandbox-certification` before integration.

---

## 2. Commits Included in feature/creem-sandbox-certification

| SHA | Description | Phase |
|-----|-------------|-------|
| `e11c591` | C-2 Phase 0-5: Creem sandbox certification scaffold | 0-5 |
| `acd8c5d` | C-2 Phase 4-8: Checkout hardening, billing success page, portal + UAT doc | 4-8 |
| `3ced4d7` | C-2 Phase 12: Sandbox certification report + manifest final update | 12 |
| `bd76011` | C-2.1: Align plan catalog — solo+business replace shop_pro, 8 product IDs required | 1 |
| `4d5a481` | Landing page: mobile mechanic positioning + feature grid + cost comparison | 0 |

---

## 3. Files Touched (creem branch additions)

| File | Purpose | Status |
|------|---------|--------|
| `app/api/billing/checkout/route.ts` | Hardened checkout: auth, role, D1 guard, dedup, server-side product ID | ✅ Done |
| `app/api/billing/portal/route.ts` | Portal route: owner-only, auth, D1 guard | ✅ Done |
| `app/api/billing/webhook/creem/route.ts` | Webhook: sig verification, idempotency, active scaffold routing | ✅ Done |
| `app/billing/success/page.tsx` | Success page with subscription polling | ✅ Done |
| `app/landing-preview/layout.tsx` | noindex metadata for landing preview | ✅ Done |
| `config/plans.ts` | Canonical 5 plans (solo/starter/professional/business/enterprise), no shop_pro | ✅ Done |
| `lib/billing/billing-service.ts` | getCurrentSubscription, syncSubscriptionFromProvider, recordPaymentEvent | ✅ Done |
| `lib/billing/feature-gates.ts` | All feature gates keyed to plan config | ✅ Done |
| `lib/payments/product-ids.ts` | Startup validation of 8 product ID env vars | ✅ Done |
| `lib/payments/types.ts` | Normalized payment types (no provider leakage) | ✅ Done |
| `middleware.ts` | /billing/success added to publicPaths | ✅ Done |
| `.env.example` | All 8 product ID vars documented | ✅ Done |
| `docs/commercial/creem/C2_CHANGE_MANIFEST.md` | C-2 manifest | ✅ Done |
| `docs/commercial/creem/CREEM_ENVIRONMENT_SETUP.md` | Env var setup guide | ✅ Done |
| `docs/commercial/creem/CREEM_SANDBOX_CERTIFICATION_REPORT.md` | Phase-by-phase report | ✅ Done |
| `docs/testing/commercial/CREEM_SANDBOX_UAT.md` | 20-scenario UAT matrix | ✅ Done |

---

## 4. Migrations Required

See `C2_4_MIGRATION_ORDER.md` for full detail. Summary:

| Migration | File | Required Before UAT | Status |
|-----------|------|---------------------|--------|
| Billing analytics tables (billing_events, shop_subscriptions) | `supabase/migrations/003_billing_analytics.sql` | Yes — needed for analytics | Not applied |
| Webhook idempotency (payment_events) | Part of billing scaffold | Yes — webhook needs payment_events table | Not confirmed applied |
| Subscriptions table | Core billing scaffold | Yes — required for all billing | Not confirmed applied |

---

## 5. Feature Flags

| Flag | Current Value | Required for UAT | Required for Live |
|------|---------------|------------------|-------------------|
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` (main) | `true` (Preview env only) | `false` until canary passes |
| `PAYMENT_PROVIDER` | not set (main) | `creem` | `creem` |
| `CREEM_TEST_MODE` | not set | `true` | `false` |

---

## 6. Vercel Environments

| Environment | Branch | Billing Enabled | Keys | Notes |
|-------------|--------|-----------------|------|-------|
| Production | `main` | `false` | None | Never use test keys here |
| Preview (UAT) | `feature/creem-sandbox-certification` | `true` | Test keys only | Webhook endpoint required |
| Local dev | `feature/creem-sandbox-certification` | `true` | Test keys + ngrok | Developer only |

**Preview URL must NOT be aliased to redlined1.com.**

---

## 7. Creem Dashboard Requirements

### For Test Mode UAT
- [ ] Test Mode toggle ON (top-right in dashboard)
- [ ] 8 recurring products created (4 plans × 2 intervals)
- [ ] Test webhook endpoint registered: `https://<VERCEL_PREVIEW_HOST>/api/billing/webhook/creem`
- [ ] All 9 webhook event types subscribed
- [ ] Test API key retrieved
- [ ] Webhook signing secret retrieved

### For Live Mode (post-UAT)
- [ ] Merchant account approved
- [ ] Live Mode toggle ON
- [ ] 8 live products created (separate from test products)
- [ ] Production webhook registered: `https://www.redlined1.com/api/billing/webhook/creem`
- [ ] Live API key retrieved
- [ ] Live webhook secret retrieved

---

## 8. Merge Order

```
1. git checkout feature/creem-sandbox-certification
2. git merge main                  # bring in C-2.2 + all bug fixes
3. Resolve any conflicts
4. npm run build && npx tsc --noEmit
5. Push feature/creem-sandbox-certification → Vercel Preview
6. Set Preview env vars (test keys only)
7. Run UAT
8. Only after SANDBOX CERTIFIED:
   git checkout main
   git merge feature/creem-sandbox-certification
   git push (with explicit approval)
```

---

## 9. Rollback

If anything goes wrong after main merge:

1. `git revert` the billing routes (checkout, portal, webhook)
2. Confirm `NEXT_PUBLIC_BILLING_ENABLED=false` in Vercel
3. Redeploy
4. Verify D1 shops still operational
5. Preserve payment_events and subscriptions records — do not delete

---

## 10. Manual Gates (must pass before each stage)

| Gate | Responsible | Evidence Required |
|------|-------------|-------------------|
| Merchant eligibility confirmed | Odey | CREEM_MERCHANT_ELIGIBILITY.md filled |
| Test products created in Creem | Odey | 8 product IDs available |
| Test env vars set in Vercel Preview | Odey | Config diagnostic passes |
| Preview deployment verified | Engineer | Routes compile, no billing on main |
| All 8 UAT plan variants pass | Engineer + Odey | CREEM_SANDBOX_UAT.md filled |
| Creem account approved | Creem | Approval email received |
| Live products created | Odey | 8 live product IDs available |
| Live webhook configured | Odey | Production webhook secret retrieved |
| Canary transaction authorized | Odey | Explicit written approval |

---

## 11. Production Risks

| Risk | Mitigation |
|------|-----------|
| Test keys used in production | All prod env vars explicitly documented; test keys use `creem_test_` prefix |
| Billing enabled for D1 internal shops | INTERNAL_SHOP_IDS hardcoded in checkout route; cannot be overridden |
| Duplicate subscription on replay | Idempotency via provider_event_id unique constraint |
| Wrong plan activated by webhook | Server-side product ID resolution; no client-supplied price IDs |
| Missing subscription tables | Safe fallbacks in billing-service.ts; app continues if table absent |
| Real payment before approval | `NEXT_PUBLIC_BILLING_ENABLED=false` gate; checkout throws 403 |
