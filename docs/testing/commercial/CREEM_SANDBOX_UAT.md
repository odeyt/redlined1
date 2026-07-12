# Creem Sandbox UAT — Acceptance Test Matrix
**Epic:** C-2 — Creem Sandbox Certification
**Branch:** `feature/creem-sandbox-certification`
**Environment:** Local dev + Creem test mode

---

## Prerequisites

Before running any test:

- [ ] `.env.local` is configured per `CREEM_ENVIRONMENT_SETUP.md`
- [ ] All 6 `CREEM_*_PRODUCT_ID` vars are set
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=false` (billing UI gated; API routes tested directly)
- [ ] ngrok is running, endpoint registered in Creem test dashboard
- [ ] `CREEM_WEBHOOK_SECRET` is set and matches Creem dashboard signing secret
- [ ] Dev server running: `npm run dev`

---

## Test Matrix: Paid Plan Variants (8 combinations)

| # | Plan | Interval | Card | Expected |
|---|------|----------|------|----------|
| T-01 | starter | monthly | 4242… | Checkout → active, webhook confirmed |
| T-02 | starter | annual | 4242… | Checkout → active, webhook confirmed |
| T-03 | professional | monthly | 4242… | Checkout → active, webhook confirmed |
| T-04 | professional | annual | 4242… | Checkout → active, webhook confirmed |
| T-05 | shop_pro | monthly | 4242… | Checkout → active, webhook confirmed |
| T-06 | shop_pro | annual | 4242… | Checkout → active, webhook confirmed |
| T-07 | enterprise | monthly | N/A | Contact Sales flow (no checkout) |
| T-08 | enterprise | annual | N/A | Contact Sales flow (no checkout) |

---

## Test Scenarios (per variant)

### S-1: Happy path checkout

1. POST `/api/billing/checkout` as owner with `{ planId, billingInterval }`
2. Assert response: `{ url: "https://checkout.creem.io/…", sessionId: "…" }`
3. Navigate to `url` in browser → use test card `4242 4242 4242 4242`
4. Complete checkout → redirected to `/billing/success`
5. `/billing/success` polls `/api/billing/status` → confirms `active`
6. Creem fires `checkout.completed` webhook → check ngrok logs
7. Assert webhook returns 200
8. Assert `payment_events` table has a row with `processed = true`
9. Assert `subscriptions` table has a row with `status = active`

### S-2: Duplicate subscription rejection

1. Complete S-1 for a plan
2. POST `/api/billing/checkout` again
3. Assert 409 response: `{ error: "A subscription already exists…" }`

### S-3: Declined card

1. POST `/api/billing/checkout` → get URL
2. Navigate to checkout → use card `4000 0000 0000 0002`
3. Assert checkout shows decline message
4. Assert no new `subscriptions` row created
5. No webhook fired (no charge)

### S-4: Webhook idempotency

1. Complete S-1
2. Resend the same `checkout.completed` webhook payload (replay via ngrok/Creem)
3. Assert webhook returns 200 with `{ received: true, duplicate: true }`
4. Assert no duplicate rows in `payment_events` or `subscriptions`

### S-5: Unauthenticated checkout rejected

1. POST `/api/billing/checkout` without session cookie
2. Assert 401 response

### S-6: Non-owner checkout rejected

1. Log in as a technician (role = technician)
2. POST `/api/billing/checkout`
3. Assert 403 response: `"only the shop owner can manage billing"`

### S-7: Internal shop rejected

1. Log in as owner of shop ID `38d55fae-741b-4bac-b520-f96eed65bf38`
2. POST `/api/billing/checkout`
3. Assert 403 response: `"Internal shops are not eligible for billing"`

### S-8: Billing disabled gate

1. Set `NEXT_PUBLIC_BILLING_ENABLED=false` (default)
2. POST `/api/billing/checkout`
3. Assert 403: `"Billing is not yet enabled"`

### S-9: Subscription cancellation

1. Complete S-1 (active subscription)
2. POST `/api/billing/portal` → get portal URL
3. Navigate to portal → cancel subscription
4. Creem fires `subscription.canceled` webhook
5. Assert webhook returns 200
6. Assert `subscriptions` row status = `canceled`

### S-10: Webhook with missing metadata

1. Manually POST a fake `checkout.completed` payload (without signature, CREEM_WEBHOOK_SECRET must be unset)
2. Payload has no `user_id` or `plan_id` in metadata
3. Assert webhook returns 200 (graceful degradation, not 500)
4. Assert `payment_events` row created but no `subscriptions` row created
5. Check server log: `"checkout.completed missing user_id or plan_id in metadata"`

---

## Edge Cases

| # | Scenario | Expected |
|---|----------|----------|
| EC-01 | `CREEM_WEBHOOK_SECRET` not set | Signature skipped with warning; events processed |
| EC-02 | Invalid HMAC signature (tampered payload) | 400 Invalid signature |
| EC-03 | Unknown event type in webhook | 200, recorded in payment_events, logged as unhandled |
| EC-04 | Empty request body to checkout | 400 Missing required fields |
| EC-05 | Invalid planId value | 400 Invalid planId |
| EC-06 | Missing `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | 500 with clear error message naming the var |
| EC-07 | Portal request with no subscription | 404 No active subscription |
| EC-08 | Portal request as non-owner | 403 Forbidden |
| EC-09 | /billing/success — subscription not yet active | Page stays in polling state for 30 s |
| EC-10 | /billing/success — Check again button | Resets polling, retries 12 more times |

---

## Pass Criteria

All S-1 through S-10 pass for at least one plan variant. All 14 edge cases verified.

Record results in `CREEM_SANDBOX_CERTIFICATION_REPORT.md`.
