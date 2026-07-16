# C-3 Preview Rollout Plan

**Date:** 2026-07-16  
**Branch:** `feature/commercial-signup-subscription-flow`  
**DO NOT promote to production without explicit owner approval.**

---

## Phase 1 — Feature Branch Validation (Current)

- [ ] TypeScript: `npx tsc --noEmit` passes
- [ ] Build: `npm run build` succeeds
- [ ] All 5 documentation files created
- [ ] Git: all changes committed on `feature/commercial-signup-subscription-flow`

---

## Phase 2 — Preview Environment (Vercel)

**Trigger:** Push feature branch → Vercel creates preview deployment automatically.

### Required Preview Env Vars

Set in Vercel dashboard → feature branch environment:

| Variable | Value | Notes |
|----------|-------|-------|
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` | Keep billing disabled on preview |
| `CREEM_API_KEY` | Test mode key | Sandbox only |
| `CREEM_WEBHOOK_SECRET` | Test webhook secret | Sandbox only |
| `CREEM_SOLO_MONTHLY_PRODUCT_ID` | Test product ID | Creem sandbox |
| `CREEM_SOLO_ANNUAL_PRODUCT_ID` | Test product ID | Creem sandbox |
| `CREEM_STARTER_MONTHLY_PRODUCT_ID` | Test product ID | |
| `CREEM_STARTER_ANNUAL_PRODUCT_ID` | Test product ID | |
| `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | Test product ID | |
| `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` | Test product ID | |
| `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` | Test product ID | |
| `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` | Test product ID | |

### Feature Flags to Enable on Preview

In Supabase dashboard (preview project) → feature_flags table, or via env:

```
NEXT_PUBLIC_FF_COMMERCIAL_SIGNUP=true
NEXT_PUBLIC_FF_COMMERCIAL_EMAIL_CONFIRM=true
NEXT_PUBLIC_FF_COMMERCIAL_ONBOARDING=true
```

---

## Phase 3 — Smoke Tests on Preview

Run through each flow manually:

- [ ] **Flow A** — Sign up with `?intent=trial`, get email, confirm, see trial banner
- [ ] **Flow B** — Click Professional plan on pricing, sign up, see plan badge, confirm email
- [ ] **Flow E** — Manually set `trial_ends_at` to past, verify free state and block overlay

D1 shops:
- [ ] Verify D1 shop owner sees no billing UI / upgrade prompts
- [ ] Verify LAK conversion box still shows on invoices/estimates for D1 shops

---

## Phase 4 — Creem Sandbox UAT

When `NEXT_PUBLIC_BILLING_ENABLED=true` on preview (separate UAT session):

- [ ] Full Flow B end-to-end with Creem test card
- [ ] Webhook receives `checkout.completed`
- [ ] `/billing/success` poll detects activation
- [ ] Cancel via Creem portal, verify status update in DB

---

## Phase 5 — Merge to Main

- [ ] PR reviewed and approved by owner
- [ ] All smoke tests passing
- [ ] No TypeScript errors
- [ ] Feature flags confirmed disabled for production
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=false` confirmed in production env

**Merge only after explicit owner approval.**

---

## Phase 6 — Monitor Post-Merge

- [ ] Vercel deployment log: no build errors
- [ ] Trial users unaffected (no regressions in shop modules)
- [ ] D1 internal shops: all workflows unchanged
- [ ] Check Supabase auth logs: no new email verification errors
