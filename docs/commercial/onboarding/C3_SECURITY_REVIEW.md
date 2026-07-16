# C-3 Security Review

**Date:** 2026-07-16  
**Branch:** `feature/commercial-signup-subscription-flow`

---

## Checklist

### Rate Limits

| Surface | Protection | Status |
|---------|-----------|--------|
| Signup (`supabase.auth.signUp`) | Supabase built-in rate limiting | ✓ Inherited |
| Resend confirmation | 60 s client cooldown + Supabase server rate limit | ✓ |
| Checkout API | Auth required; one request per session | ✓ |
| Billing status poll | Auth required; max 20 requests over 60 s | ✓ |
| Webhook | Signature verified (CREEM_WEBHOOK_SECRET) | ✓ |

### CSRF

| Surface | Protection |
|---------|-----------|
| Checkout API | POST requires auth cookie (Supabase SSR) |
| Portal API | POST requires auth cookie |
| Webhook | Signature-based, not cookie-based |
| Signup form | HTTPS + SameSite cookies |

### Server-Side Validation

- ✓ Plan key validated against canonical set on server (checkout route)
- ✓ Period validated against `['monthly', 'annual']` on server
- ✓ Product ID resolved from env var on server (never from client)
- ✓ User role validated (owner required for checkout/portal)
- ✓ D1 internal shop UUIDs blocked from checkout
- ✓ Exempt emails/domains blocked from checkout
- ✓ Billing feature flag checked server-side

### No Client-Side Product IDs

- PricingSection sends only plan key (e.g. `professional`) in URL
- Signup page stores only plan key in localStorage
- Auth callback sends plan key to checkout API
- Checkout API resolves `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` from env
- Creem product ID NEVER appears in client code or URL

### Duplicate Prevention

| Scenario | Prevention |
|---------|-----------|
| Double signup | Supabase auth deduplicates by email |
| Duplicate shop | `getOrCreatePrimaryShop`: checks existing `shop_users` owner row first |
| Duplicate trial | `ensureTrialSubscription`: checks existing `subscriptions` row first |
| Duplicate checkout | Billing enabled check; one active subscription check (TODO: add to checkout route) |
| Duplicate webhook | `billing_events.provider_event_id` idempotency check |

### Checkout Redirect Safety

- Success URL: `/billing/success` — does NOT activate subscription
- Cancel URL: `/billing/canceled` — does NOT terminate trial
- Activation only from verified webhook (`checkout.completed`)
- `/billing/success` polls server DB; redirect param is NOT trusted

### Auth Callback

- PKCE + implicit flow supported
- Token hash verification via `supabase.auth.verifyOtp`
- Plan intent from localStorage, not URL — cannot be spoofed via link
- `rd1_signup_intent` expires after 48 h

### No PII in Analytics

- Analytics events (if tracked) contain only: plan key, intent, boolean flags
- No email, name, or payment data in event payloads

### D1 Internal Shop Protection

Enforced at three layers:
1. Checkout API: `getInternalShopIds()` UUID check → 403
2. Auth callback: exempt domain check → skip checkout
3. AppShell: exempt domain check → clear pending checkout key

---

## Known Gaps (to address before Production)

1. **Duplicate active subscription check in checkout route** — if user calls checkout twice, two Creem sessions are created. Add check: if `subscriptions.status = 'active'`, return 409.
2. **`onboarding_sessions` RLS** — service role only for writes. Verify no anon access.
3. **localStorage intent expiry** — client-side only. Server should also validate intent age from `onboarding_sessions.created_at`.
4. **Technician role checkout** — blocked by `shopUser.role === 'technician'` check ✓ but should also block `viewer` role.
