# User Journey Specification — C-3 Commercial Flow

**Version:** 1.0  
**Date:** 2026-07-16  
**Status:** Canonical reference for all C-3 implementation work

---

## Flow A — Free Trial

```
Landing page
  ↓ "Start Free Trial"
/signup?intent=trial
  ↓ Fill name, shop name, email, password, consent
  ↓ supabase.auth.signUp()
  ↓ localStorage: rd1_signup_intent = {intent:'trial', plan:null, period:null}
  ↓ /api/signup-notify (fire-and-forget)
Confirmation screen
  → "EMAIL VERIFICATION REQUIRED" badge (NOT "Account Activated")
  → "Your account has been created. Confirm your email to activate…"
  → Step list: Check inbox → Click link → Sign in and explore
  → Resend button (60 s cooldown)
  → Sign In CTA
User clicks email link
  → /auth/callback
  → Session exchange (PKCE or implicit)
  → handleSignupSuccess()
  → No rd1_pending_checkout → route to /
App shell mounts
  → usePlan() reads profiles.plan = 'trial'
  → Trial banner shown with days remaining
  → All modules accessible during trial
```

---

## Flow B — Select Paid Plan Before Signup

```
Pricing section
  ↓ User selects interval (monthly | annual)
  ↓ Clicks "Get Professional"
/signup?plan=professional&period=monthly&intent=paid
  ↓ Plan banner shown in form: "Professional — $99/mo"
  ↓ Fill form + consent
  ↓ supabase.auth.signUp()
  ↓ localStorage:
      rd1_signup_intent    = {intent:'paid', plan:'professional', period:'monthly', …}
      rd1_pending_checkout = {planId:'professional', billingInterval:'monthly'}
Confirmation screen
  → Shows: "Selected plan: Professional — $99/mo"
  → Step 3: "You'll be redirected to pay for the Professional plan ($99/mo)"
  → Sign In CTA available
User clicks email link
  → /auth/callback → handleSignupSuccess()
  → Reads rd1_pending_checkout
  → if billing disabled: clears key, routes to /
  → if billing enabled: POST /api/billing/checkout
      → server validates plan + period
      → resolves product ID from env
      → returns Creem checkout URL
  → window.location.href = checkout URL
Creem checkout
  ↓ User completes payment
/billing/success
  ↓ Polls /api/billing/status every 3 s (max 20 × = 60 s)
  ↓ Webhook fires: checkout.completed
  ↓ billingService activates subscription in DB
  ↓ profiles.plan updated to 'professional'
  ↓ Poll returns {status: 'active'}
  → Show: "Subscription Active", plan details, renewal date
  → "Go to Dashboard →"
```

---

## Flow C — Trial User Upgrades

```
Authenticated trial user
  ↓ Clicks "Upgrade" / visits /landing-preview#pricing
  ↓ Selects plan + interval
  ↓ POST /api/billing/checkout {planId, billingInterval}
      Server:
        1. Authenticate
        2. Resolve shop via shop_users
        3. Confirm owner role
        4. Reject D1 internal shops (UUIDs 38d5… / 90b7…)
        5. Confirm billing flag (CREEM_API_KEY present)
        6. Validate canonical plan + period
        7. Resolve product ID from env (CREEM_{PLAN}_{PERIOD}_PRODUCT_ID)
        8. Create Creem checkout session with metadata
        9. Return {url}
  → Redirect to Creem
Creem checkout → payment complete
  → /billing/success (polls DB)
Webhook: checkout.completed
  → activateSubscription(shopId, planKey, …)
  → profiles.plan = 'professional' (or chosen plan)
  → subscriptions.status = 'active'
  → subscriptions.converted_at = now
  → watermark removed (needsWatermark('pro') = false)
Poll returns active → show success screen
```

---

## Flow D — Existing Paid User

```
/billing (BillingDashboard)
  → Shows: plan, status, billing interval, renewal date
  → "Manage Subscription" → POST /api/billing/portal
      → resolves providerCustomerId from DB
      → creates Creem portal URL server-side
      → returns {url}
  → Redirect to Creem portal

Creem portal supports:
  - View invoices
  - Update payment method
  - Schedule cancellation (retains access to period_end)
  - Cancel immediately (if supported by Creem)

Webhook: subscription.updated → update status in DB
Webhook: subscription.cancelled → status = 'cancelled', access until period_end
```

---

## Flow E — Expired Trial

```
profiles.plan = 'trial' AND trial_ends_at < now()
  → getPlanStatus() returns 'free'
  → AppShell shows fullscreen trial-expired overlay
  → "Choose a Plan →" → /landing-preview#pricing
  → Data preserved: customers, vehicles, jobs, estimates, invoices, settings
  → D1 shops (UUIDs): exempt, always 'pro' effective access
```

---

## Canonical URL Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `plan` | `solo\|starter\|professional\|business` | Plan key (no enterprise, no internal, no trial) |
| `period` | `monthly\|annual` | Billing interval |
| `intent` | `trial\|paid` | Signup intent |
| `email` | URL-encoded email | Pre-fill signup form |

**Legacy `billing=` param**: still accepted by signup page for backward compatibility.

---

## D1 Internal Shop Protection

Shops with IDs `38d55fae-741b-4bac-b520-f96eed65bf38` and `90b72748-bf01-4456-999f-f4ba48091606` are permanently exempt from all commercial restrictions. This is enforced:

1. **Server** (`/api/billing/checkout`): `getInternalShopIds()` check → 403
2. **Server** (`/api/billing/portal`): same check
3. **Client** (`AppShell`, `auth/callback`): exempt email/domain check
4. **planGate**: internal plan maps to 'pro' effective status
