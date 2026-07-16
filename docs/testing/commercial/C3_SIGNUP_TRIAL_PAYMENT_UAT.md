# C-3 UAT — Signup, Trial, and Payment Flows

**Date:** 2026-07-16  
**Branch:** `feature/commercial-signup-subscription-flow`  
**Environment:** Creem Sandbox (Test Mode)  
**Tester:** _______________  
**Date Tested:** _______________

---

## Prerequisites

- [ ] Preview deployment live with C-3 feature branch
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=false` for smoke test phase
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=true` for payment phase (Creem sandbox only)
- [ ] Test email inbox accessible
- [ ] Creem sandbox test card: `4242 4242 4242 4242`, any future expiry, any CVC

---

## Flow A — Free Trial Signup

| # | Step | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| A-1 | Visit `/signup?intent=trial` | Form shown, no plan badge, "Start your 7-day free trial" | | |
| A-2 | Submit without ticking consent | Submit blocked, error shown | | |
| A-3 | Fill form, tick consent, submit | "EMAIL VERIFICATION REQUIRED" badge shown (NOT green "Account Created") | | |
| A-4 | Confirmation screen | Shows step list: Check inbox → Click link → Sign in | | |
| A-5 | Check inbox | Email from Supabase with "Confirm your RedlineD1 account" subject | | |
| A-6 | Click confirmation link | Redirects to `/auth/callback` → then to `/` | | |
| A-7 | App loads | Trial banner visible, shows days remaining | | |
| A-8 | Navigate to any module | Access granted during trial | | |
| A-9 | Click resend on confirmation screen | Button disabled 60 s, then re-enabled; second email arrives | | |

---

## Flow B — Paid Plan Signup (Billing Disabled)

| # | Step | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| B-1 | Visit pricing, select Professional monthly | Redirected to `/signup?plan=professional&period=monthly&intent=paid` | | |
| B-2 | Form shown | Plan badge: "Professional — $99/mo" visible | | |
| B-3 | Submit form | Confirmation screen shows "Selected plan: Professional — $99/mo" | | |
| B-4 | Confirm email | Auth callback fires; billing disabled → redirect to `/` (no checkout) | | |
| B-5 | App loads | Trial banner (billing disabled, no payment taken) | | |

---

## Flow B-Pay — Paid Plan Signup (Billing Enabled — Sandbox)

| # | Step | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| BP-1 | Enable billing on preview env | `NEXT_PUBLIC_BILLING_ENABLED=true` | | |
| BP-2 | Sign up with Professional monthly (new email) | Same as B-1 to B-3 | | |
| BP-3 | Click email confirmation link | Auth callback reads `rd1_pending_checkout` → calls `/api/billing/checkout` | | |
| BP-4 | Redirect to Creem checkout | Creem sandbox checkout page shown | | |
| BP-5 | Enter test card | `4242 4242 4242 4242`, any expiry/CVC | | |
| BP-6 | Complete payment | Redirected to `/billing/success` | | |
| BP-7 | Success page | "Processing your subscription..." spinner shown | | |
| BP-8 | Webhook fires | DB: `subscriptions.status = 'active'`, `profiles.plan = 'professional'` | | |
| BP-9 | Poll resolves | Within 60 s: "Subscription Active" shown with plan name and renewal date | | |
| BP-10 | Click "Go to Dashboard" | Redirects to `/`, no trial banner, full access | | |

---

## Flow C — Trial User Upgrades (Billing Enabled — Sandbox)

| # | Step | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| C-1 | Sign up via Flow A, confirm email | Trial active | | |
| C-2 | Visit pricing section, click Professional | POST to `/api/billing/checkout` | | |
| C-3 | Checkout opens | Creem sandbox checkout | | |
| C-4 | Complete payment | Redirect to `/billing/success` | | |
| C-5 | Poll resolves | "Subscription Active" | | |
| C-6 | Check DB | `subscriptions.converted_at` not null, `profiles.plan = 'professional'` | | |
| C-7 | Verify no duplicate subscription | Only one row in `subscriptions` for this user | | |

---

## Flow D — Subscription Management

| # | Step | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| D-1 | Active paid user visits `/billing` | Shows plan, status, renewal date, "Manage Subscription" button | | |
| D-2 | Click "Manage Subscription" | Redirects to Creem portal | | |
| D-3 | Cancel in portal | Returns to app; DB updated via webhook | | |
| D-4 | Check `/billing` | Status shows "Cancels on [date]" | | |

---

## Flow E — Expired Trial

| # | Step | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| E-1 | Set `trial_ends_at` to past in DB | Manually via Supabase SQL Editor | | |
| E-2 | Refresh app | Full-screen trial expired overlay shown | | |
| E-3 | Click "Choose a Plan" | Redirects to pricing section | | |
| E-4 | Verify data preserved | Customers, vehicles, jobs, estimates intact | | |
| E-5 | Verify D1 shops unaffected | D1 shop owner sees no trial expiry overlay | | |

---

## Idempotency and Edge Cases

| # | Test | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| I-1 | Sign up twice with same email | Second signup shows email already registered | | |
| I-2 | Click confirmation link twice | Second click: session already active, redirect to / | | |
| I-3 | Retry checkout after tab close | Same `rd1_pending_checkout` triggers new checkout session | | |
| I-4 | Two users, same shop (shouldn't happen) | Only one owner row per shop in `shop_users` | | |

---

## D1 Internal Shop Protection

| # | Test | Expected | Pass/Fail | Notes |
|---|------|----------|-----------|-------|
| D1-1 | Log in as D1 shop owner | No billing banner, no upgrade prompts | | |
| D1-2 | POST to `/api/billing/checkout` as D1 owner | Returns 403 | | |
| D1-3 | Invoice with THB currency on D1 shop | LAK conversion box visible with rate input | | |
| D1-4 | Invoice with THB currency on non-D1 shop | LAK conversion box NOT visible | | |
| D1-5 | Print invoice from D1 shop | LAK box appears in print output | | |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Owner | | | |
| Developer | | | |

**Note:** Billing flows (BP, C, D) must be signed off before `NEXT_PUBLIC_BILLING_ENABLED` is ever set to `true` in the production environment.
