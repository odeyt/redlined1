# Creem Staging Activation Checklist

> **Environment**: Staging (`staging.redlined1.com`)
> **Status**: NOT ACTIVATED — complete every item before flipping `NEXT_PUBLIC_BILLING_ENABLED=true`
> **Security**: Never enable production billing or subscription enforcement until after go-live sign-off

---

## Part 1 — Creem Dashboard Setup

Log in to the Creem dashboard and create exactly **6 products**.

| # | Product Name | Billing Period | Price | Plan Key in Code |
|---|---|---|---|---|
| 1 | Redline Starter Monthly | Monthly | $49 | `starter_monthly` |
| 2 | Redline Starter Annual | Annual | $490 | `starter_annual` |
| 3 | Redline Professional Monthly | Monthly | $99 | `professional_monthly` |
| 4 | Redline Professional Annual | Annual | $990 | `professional_annual` |
| 5 | Redline Business Monthly | Monthly | $199 | `business_monthly` |
| 6 | Redline Business Annual | Annual | $1,990 | `business_annual` |

After creating each product, copy its **Product ID** (format: `prod_xxxx`) into `.env.staging`:

```
CREEM_STARTER_MONTHLY_PRODUCT_ID=prod_xxxx
CREEM_STARTER_ANNUAL_PRODUCT_ID=prod_xxxx
CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID=prod_xxxx
CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID=prod_xxxx
CREEM_BUSINESS_MONTHLY_PRODUCT_ID=prod_xxxx
CREEM_BUSINESS_ANNUAL_PRODUCT_ID=prod_xxxx
```

> **Note**: Ignore `CREEM_SHOP_PRO_*` and `CREEM_ENTERPRISE_*` vars in `.env.staging.example` — they are unused leftovers and should be removed from your actual `.env.staging`.

---

## Part 2 — Webhook Configuration in Creem Dashboard

1. In Creem dashboard → **Webhooks** → **Add Endpoint**
2. Set URL to: `https://staging.redlined1.com/api/billing/webhook/creem`

   > ⚠️ The comment in `.env.staging.example` says `/api/webhooks/creem` — **that is wrong**. The actual route is `/api/billing/webhook/creem`.

3. Select these events to subscribe to:
   - `checkout.completed`
   - `subscription.updated`
   - `subscription.cancelled`
   - `subscription.past_due`
   - `payment.failed`

4. Save the webhook and copy the **Webhook Secret** into `.env.staging`:
   ```
   CREEM_WEBHOOK_SECRET=whsec_xxxx
   ```

---

## Part 3 — Environment Variable Verification

Confirm every variable below is set in Vercel → Project → Settings → Environment Variables (Staging environment):

| Variable | Required Value / Notes |
|---|---|
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` ← keep false until Part 5 complete |
| `BILLING_PROVIDER` | `creem` |
| `CREEM_API_KEY` | From Creem dashboard → API Keys |
| `CREEM_WEBHOOK_SECRET` | From webhook setup above |
| `CREEM_SUCCESS_URL` | `https://staging.redlined1.com/billing/success` |
| `CREEM_CANCEL_URL` | `https://staging.redlined1.com/billing/cancel` |
| `CREEM_STARTER_MONTHLY_PRODUCT_ID` | `prod_xxxx` |
| `CREEM_STARTER_ANNUAL_PRODUCT_ID` | `prod_xxxx` |
| `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | `prod_xxxx` |
| `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` | `prod_xxxx` |
| `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` | `prod_xxxx` |
| `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` | `prod_xxxx` |

> **Remove from `.env.staging`**: `PAYMENT_PROVIDER` (not used — code uses `BILLING_PROVIDER`), `CREEM_SHOP_PRO_*`, `CREEM_ENTERPRISE_*`.

---

## Part 4 — Checkout Test Plan

Run these tests against staging after env vars are deployed:

### 4.1 — Checkout Initiation (billing disabled)
- [ ] With `NEXT_PUBLIC_BILLING_ENABLED=false`, clicking "Upgrade" must NOT reach Creem
- [ ] `billingService.createCheckout()` must throw `"Billing is not enabled"`
- [ ] No checkout session should appear in Creem dashboard

### 4.2 — Enable billing for testing
- Temporarily set `NEXT_PUBLIC_BILLING_ENABLED=true` in Vercel staging, redeploy

### 4.3 — Checkout flow (Creem test mode)
- [ ] Click Upgrade → Starter Monthly in the app
- [ ] Redirected to Creem hosted checkout page
- [ ] Use Creem test card number to complete checkout
- [ ] Redirected to `CREEM_SUCCESS_URL` on success
- [ ] `checkout.completed` webhook received (check Vercel function logs)
- [ ] `billing_events` row inserted with `event_type = 'checkout.completed'`
- [ ] `shop_subscriptions` row created/updated for the test shop
- [ ] Creem dashboard shows the subscription as active

### 4.4 — Cancel flow
- [ ] Abandon checkout → redirected to `CREEM_CANCEL_URL`
- [ ] No subscription record created
- [ ] No billing event logged

### 4.5 — Plan upgrade/downgrade
- [ ] Upgrade from Starter to Professional via billing portal
- [ ] `subscription.updated` webhook fires
- [ ] `shop_subscriptions.plan_key` updated correctly

### 4.6 — Re-disable billing after testing
- Set `NEXT_PUBLIC_BILLING_ENABLED=false` again and redeploy

---

## Part 5 — Webhook Verification Test Plan

### 5.1 — Signature verification
- [ ] POST to `/api/billing/webhook/creem` with no `x-creem-signature` header → check logs show warning (not 400)
- [ ] POST with invalid signature → 400 response
- [ ] POST with valid HMAC-SHA256 signature → 200 response

To generate a valid test signature:
```bash
echo -n '<raw-body-json>' | openssl dgst -sha256 -hmac '<CREEM_WEBHOOK_SECRET>'
# Prefix output with "sha256=" and set as x-creem-signature header
```

### 5.2 — Idempotency
- [ ] Send same `checkout.completed` event twice (same `provider_event_id`)
- [ ] Second delivery must NOT create a duplicate `billing_events` row
- [ ] Both requests return 200

### 5.3 — Event types
- [ ] `checkout.completed` → subscription row created
- [ ] `subscription.updated` → subscription row updated
- [ ] `subscription.cancelled` → `shop_subscriptions.status = 'cancelled'`
- [ ] `subscription.past_due` → `shop_subscriptions.status = 'past_due'`
- [ ] `payment.failed` → event logged, no crash

### 5.4 — Creem dashboard delivery log
- [ ] All webhook deliveries show status 200 in Creem dashboard → Webhooks → Recent deliveries
- [ ] Retry test: use Creem dashboard "Resend" to resend an event; confirm idempotency holds

---

## Part 6 — D1 Internal Shop Protection

Before enabling enforcement, run the D1 protection SQL. See [D1_INTERNAL_BILLING_PROTECTION.md](./D1_INTERNAL_BILLING_PROTECTION.md).

**Rule**: D1 internal shops must never be blocked or charged.

---

## Part 7 — Go / No-Go Checklist

Complete all items before setting `NEXT_PUBLIC_BILLING_ENABLED=true` permanently:

- [ ] All 6 Creem products created with correct prices
- [ ] Webhook registered at correct URL with all 5 event types
- [ ] All env vars set in Vercel staging
- [ ] Checkout test (Part 4) passed
- [ ] Webhook tests (Part 5) passed
- [ ] D1 shops have `trialing` subscriptions (Part 6 SQL run)
- [ ] `npm run lint` → 0 errors
- [ ] `npm run typecheck` → 0 errors
- [ ] `npm run build` → successful
- [ ] `subscription_enforcement` feature flag is **false** in DB
- [ ] Production billing is **NOT** enabled

---

## DO NOT

- DO NOT set `NEXT_PUBLIC_BILLING_ENABLED=true` on production
- DO NOT enable `subscription_enforcement` flag in any environment yet
- DO NOT run the protection SQL more than once (it uses `ON CONFLICT DO NOTHING`)
- DO NOT store `CREEM_API_KEY` or `CREEM_WEBHOOK_SECRET` in source code or committed `.env` files
- DO NOT block D1 internal shops under any circumstances
