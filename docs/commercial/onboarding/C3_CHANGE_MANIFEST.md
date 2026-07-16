# C-3 Change Manifest — Commercial Signup, Subscription, and Onboarding Flow

**Branch:** `feature/commercial-signup-subscription-flow`  
**Based on:** `main` (commit `444f17f`)  
**Date:** 2026-07-16  
**Status:** In Progress — Preview/Test Mode only

---

## Routes Affected

| Route | Change | Risk |
|-------|--------|------|
| `/signup` | Fixed confirmation badge, added resend, added consent checkbox, standardized `period` param | Low |
| `/billing/success` | Replaced blind redirect with DB-polling activation flow | Medium |
| `/billing/canceled` | Existing — no change | None |
| `/api/billing/checkout` | Existing — no change | None |
| `/api/billing/status` | Existing — consumed by new success page poll | None |
| `/api/billing/webhook/creem` | Existing — no change | None |
| `/landing-preview#pricing` | CTA URLs standardized to `period=` and `intent=` params | Low |

---

## Components Affected

| Component | Change |
|-----------|--------|
| `app/signup/page.tsx` | Full rewrite: resend button, consent checkbox, EMAIL VERIFICATION REQUIRED badge, `period` param, intent persistence |
| `app/billing/success/page.tsx` | Full rewrite: polling state machine (processing→active→timeout→failed) |
| `components/marketing/PricingSection.tsx` | CTA URLs: `billing=` → `period=`, added `intent=paid`, trial CTA adds `intent=trial` |
| `commercial/onboarding/types.ts` | **New** — `CommercialSignupIntent` typed model |
| `commercial/onboarding/ShopProvisioningService.ts` | **New** — idempotent provisioning functions |

---

## Database Tables Read or Written

| Table | Operation | Change? |
|-------|-----------|---------|
| `profiles` | READ (plan, trial_ends_at) | None |
| `shop_users` | READ/WRITE (role, shop_id) | None |
| `subscriptions` | READ/WRITE (plan_key, status, trial dates) | None |
| `billing_events` | READ (idempotency) | None |
| `onboarding_sessions` | READ/WRITE | **New table required — see migration runbook** |
| `shops` | WRITE (on provisioning) | None |

---

## Feature Flags

| Flag | Default | Purpose |
|------|---------|---------|
| `commercial_signup_flow` | OFF | Gates new signup intent flow |
| `commercial_email_confirmation` | OFF | Gates resend-confirmation UI |
| `commercial_onboarding` | OFF | Gates onboarding session tracking |
| `commercial_trial_provisioning` | OFF | Gates server-side trial creation |
| `commercial_checkout` | OFF | Gates checkout route (controlled by CREEM_API_KEY presence) |
| `commercial_billing_success` | ON | New polling success page (safe upgrade — no prod billing) |

---

## Plan-Intent Handling

1. Visitor clicks pricing CTA → `/signup?plan=professional&period=monthly&intent=paid`
2. Signup page reads params, stores `rd1_signup_intent` + `rd1_pending_checkout` in localStorage
3. User confirms email → `/auth/callback` fires
4. Auth callback reads `rd1_pending_checkout`, validates plan/period, redirects to Creem (if billing enabled)
5. AppShell fallback reads `rd1_pending_checkout` on load, clears if user is exempt

---

## Trial Behavior

- Trial period: **7 calendar days**, server-authoritative
- Trial starts: on shop provisioning completion (not on signup page view)
- Trial ends: `trial_ends_at` in `profiles` and `subscriptions` tables
- Device time cannot extend trial (server computes end date)
- One trial per user (enforced by idempotent `ensureTrialSubscription`)

---

## Webhook Authority

- `checkout.completed` → activates subscription in DB → `profiles.plan` updated
- `subscription.updated` → updates status
- `subscription.cancelled` → cancels, retains history
- `/billing/success` only claims "active" after polling `/api/billing/status` returns `status: 'active'`
- No client-side activation — success redirect alone does NOT activate

---

## Email Verification Behavior

- Confirmation badge changed from "ACCOUNT CREATED" to "EMAIL VERIFICATION REQUIRED"
- Resend button added with 60 s cooldown
- Plan intent persisted through verification via localStorage (`rd1_signup_intent`)
- Auth callback consumes intent and routes appropriately

---

## Rollback

1. `git revert` commits on this branch
2. localStorage keys `rd1_signup_intent` and `rd1_pending_checkout` are advisory; clearing them is safe
3. `onboarding_sessions` table: additive, no existing data affected
4. No production billing was enabled — no payment impact

---

## Tests

See `tests/commercial/` for the full test suite (Part 24 of epic).

---

## Production Risks

- `NEXT_PUBLIC_BILLING_ENABLED` remains `false` — no live payment risk
- New success page polls `/api/billing/status` — requires authentication; 401 transitions to `failed` state safely
- localStorage intent keys expire after 48 h
