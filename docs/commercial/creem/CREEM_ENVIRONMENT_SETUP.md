# Creem Environment Setup Guide
**Epic:** C-2 — Creem Sandbox Certification
**Applies to:** local dev + staging (sandbox keys only)

---

## Prerequisites

1. Create a Creem account at [creem.io](https://creem.io)
2. Switch to **Test Mode** in the Creem dashboard (toggle top-right)
3. Do not use live/production keys during sandbox certification

---

## Required Environment Variables

Copy `.env.example` to `.env.local` and fill in each value below.

### Creem API Credentials

```env
# Active payment provider — must be "creem" for this epic
PAYMENT_PROVIDER=creem

# Creem test-mode API key
# Creem Dashboard → Settings → API Keys → Test Key
CREEM_API_KEY=creem_test_...

# Webhook signing secret
# Creem Dashboard → Developers → Webhooks → your endpoint → Signing Secret
CREEM_WEBHOOK_SECRET=whsec_test_...
```

### Redirect URLs

```env
# After successful checkout — should land on billing success page
CREEM_SUCCESS_URL=http://localhost:3000/billing/success

# After canceled checkout — return to pricing
CREEM_CANCEL_URL=http://localhost:3000/pricing
```

### Product IDs (6 required — paid plans only)

Create one product per row in the Creem test dashboard:

| Env Var | Plan | Interval | Price |
|---------|------|----------|-------|
| `CREEM_STARTER_MONTHLY_PRODUCT_ID` | Starter | Monthly | $29/mo |
| `CREEM_STARTER_ANNUAL_PRODUCT_ID` | Starter | Annual | $290/yr |
| `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | Professional | Monthly | $59/mo |
| `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` | Professional | Annual | $590/yr |
| `CREEM_SHOP_PRO_MONTHLY_PRODUCT_ID` | Shop Pro | Monthly | $99/mo |
| `CREEM_SHOP_PRO_ANNUAL_PRODUCT_ID` | Shop Pro | Annual | $990/yr |

Enterprise uses custom pricing — no product ID required (contact-sales flow only).

```env
CREEM_STARTER_MONTHLY_PRODUCT_ID=prod_test_...
CREEM_STARTER_ANNUAL_PRODUCT_ID=prod_test_...
CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID=prod_test_...
CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID=prod_test_...
CREEM_SHOP_PRO_MONTHLY_PRODUCT_ID=prod_test_...
CREEM_SHOP_PRO_ANNUAL_PRODUCT_ID=prod_test_...
```

### Billing Feature Gate

```env
# Keep FALSE during sandbox certification — enables billing UI without real charges
NEXT_PUBLIC_BILLING_ENABLED=false
```

---

## Webhook Endpoint Setup

1. Start your local dev server: `npm run dev`
2. Install [ngrok](https://ngrok.com): `ngrok http 3000`
3. Copy the HTTPS forwarding URL (e.g. `https://abc123.ngrok.io`)
4. In Creem Dashboard → Developers → Webhooks → Add Endpoint:
   - URL: `https://abc123.ngrok.io/api/billing/webhook/creem`
   - Events: select all (see list below)
5. Copy the **Signing Secret** → set as `CREEM_WEBHOOK_SECRET`

### Required Webhook Events

Subscribe to all of these in the Creem dashboard:

- `checkout.completed`
- `subscription.created`
- `subscription.updated`
- `subscription.canceled`
- `subscription.expired`
- `subscription.past_due`
- `subscription.renewed`
- `invoice.paid`
- `invoice.payment_failed`

---

## Test Card Numbers (Creem sandbox)

| Card | Use |
|------|-----|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 0002` | Declined |
| `4000 0000 0000 9995` | Insufficient funds |
| `4000 0027 6000 3184` | Requires authentication (3DS) |

Expiry: any future date. CVV: any 3 digits.

---

## Validation

After setting all env vars, run:

```bash
npx tsx -e "
const { validateCreemProductIds } = require('./lib/payments/product-ids');
const r = validateCreemProductIds();
console.log(r.ok ? '✓ All product IDs set' : '✗ Missing: ' + r.missing.join(', '));
"
```

Or check the server logs on first checkout — missing product IDs throw immediately with the var name.

---

## Safety Checklist Before Any Test

- [ ] `PAYMENT_PROVIDER=creem` (not stripe)
- [ ] `CREEM_API_KEY` starts with `creem_test_` (not live key)
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=false`
- [ ] ngrok is running and endpoint is registered in Creem test dashboard
- [ ] All 6 product ID vars are set
