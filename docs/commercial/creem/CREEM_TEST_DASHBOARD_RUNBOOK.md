# Creem Test Dashboard Runbook
**Epic:** C-2.4
**Applies to:** Sandbox UAT only — Test Mode keys

---

## NEVER paste secrets into chat, source code, or documentation.

---

## Step 1 — Enable Test Mode

1. Log in to https://app.creem.io
2. Locate the **Test Mode** toggle (top-right of dashboard)
3. Click to enable — the dashboard turns orange/yellow to indicate test mode
4. Confirm all product creation happens in Test Mode

---

## Step 2 — Create Eight Recurring Products

Create exactly these 8 products in Creem Test Mode.

For each product:
- Type: **Recurring subscription**
- Currency: **USD**
- Billing cycle: as specified

| # | Product Name | Interval | Price | Env Var to fill |
|---|-------------|----------|-------|-----------------|
| 1 | RedlineD1 Solo Monthly | Monthly | $24.00 | `CREEM_SOLO_MONTHLY_PRODUCT_ID` |
| 2 | RedlineD1 Solo Annual | Annual | $240.00 | `CREEM_SOLO_ANNUAL_PRODUCT_ID` |
| 3 | RedlineD1 Starter Monthly | Monthly | $49.00 | `CREEM_STARTER_MONTHLY_PRODUCT_ID` |
| 4 | RedlineD1 Starter Annual | Annual | $490.00 | `CREEM_STARTER_ANNUAL_PRODUCT_ID` |
| 5 | RedlineD1 Professional Monthly | Monthly | $99.00 | `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` |
| 6 | RedlineD1 Professional Annual | Annual | $990.00 | `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` |
| 7 | RedlineD1 Business Monthly | Monthly | $179.00 | `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` |
| 8 | RedlineD1 Business Annual | Annual | $1,790.00 | `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` |

Enterprise: **no product** — contact sales only.

---

## Step 3 — Confirm Prices and Intervals

After creating each product:
1. Click into the product
2. Verify: name, price in USD, billing interval
3. Verify: the product shows as a recurring subscription (not one-time)

---

## Step 4 — Copy Each Test Product ID

For each product:
1. Open the product detail page in Creem
2. Copy the **Product ID** (format: `prod_test_...`)
3. Note it against the env var name in Step 2's table
4. Do NOT share these in chat or commit them to code

---

## Step 5 — Retrieve Test Mode API Key

1. Creem Dashboard → Settings → API Keys
2. Ensure you are in **Test Mode**
3. Copy the Test Mode API key (starts with `creem_test_`)
4. Do NOT use the live key — live keys do NOT start with `creem_test_`

---

## Step 6 — Configure Test Mode Webhook Endpoint

For **Vercel Preview UAT**:

1. Creem Dashboard → Developers → Webhooks → Add Endpoint
2. URL: `https://<YOUR_VERCEL_PREVIEW_HOST>/api/billing/webhook/creem`
   - Replace `<YOUR_VERCEL_PREVIEW_HOST>` with the actual Vercel Preview URL (e.g., `redlined1-git-creem-sandbox.vercel.app`)
   - Do NOT use `www.redlined1.com` for test mode
3. Subscribe to ALL of the following events:
   - `checkout.completed`
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.expired`
   - `subscription.past_due`
   - `subscription.renewed`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Save the endpoint

For **local dev** (optional, using ngrok):

1. Run: `ngrok http 3000`
2. Copy the HTTPS forwarding URL: `https://abc123.ngrok-free.app`
3. Register endpoint: `https://abc123.ngrok-free.app/api/billing/webhook/creem`
4. Same event subscriptions as above

---

## Step 7 — Copy Test Mode Webhook Secret

1. In Creem Dashboard → Developers → Webhooks → your endpoint
2. Click **Reveal Signing Secret**
3. Copy the webhook signing secret (starts with `whsec_test_`)
4. This goes into `CREEM_WEBHOOK_SECRET` — never into source code

---

## Step 8 — Enter Variables into Vercel Preview Only

In the Vercel dashboard:
1. Select your project → Settings → Environment Variables
2. Set scope to **Preview** (NOT Production, NOT all)
3. Add the following (key names only — values come from Creem dashboard):

```
CREEM_API_KEY                         = <test key from Step 5>
CREEM_WEBHOOK_SECRET                  = <webhook secret from Step 7>
CREEM_TEST_MODE                       = true
BILLING_PROVIDER                      = creem
PAYMENT_PROVIDER                      = creem
NEXT_PUBLIC_BILLING_ENABLED           = true

CREEM_SOLO_MONTHLY_PRODUCT_ID         = <from Step 4>
CREEM_SOLO_ANNUAL_PRODUCT_ID          = <from Step 4>
CREEM_STARTER_MONTHLY_PRODUCT_ID      = <from Step 4>
CREEM_STARTER_ANNUAL_PRODUCT_ID       = <from Step 4>
CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID = <from Step 4>
CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID  = <from Step 4>
CREEM_BUSINESS_MONTHLY_PRODUCT_ID     = <from Step 4>
CREEM_BUSINESS_ANNUAL_PRODUCT_ID      = <from Step 4>

CREEM_SUCCESS_URL = https://<VERCEL_PREVIEW_HOST>/billing/success
CREEM_CANCEL_URL  = https://<VERCEL_PREVIEW_HOST>/pricing
```

**Verify `NEXT_PUBLIC_BILLING_ENABLED=false` remains set for Production scope.**

---

## Step 9 — Redeploy Preview

1. In Vercel: Deployments → find the latest Preview deployment
2. Click the three-dot menu → Redeploy
3. Or push a commit to `feature/creem-sandbox-certification` — Vercel auto-builds

---

## Step 10 — Verify Configuration Health

After redeployment:

1. Log in to the Preview URL as `admin@redlined1.com`
2. Navigate to: `<PREVIEW_URL>/admin/billing-health`
3. The environment diagnostic section should show:

```json
{
  "environment": "test",
  "apiKeyConfigured": true,
  "webhookSecretConfigured": true,
  "productMappingsConfigured": 8,
  "billingEnabled": true,
  "ready": true
}
```

4. If any value is `false` or `productMappingsConfigured < 8`, check the env vars in Vercel

5. Also POST to `/api/billing/env-check` (platform-owner-only endpoint) to verify server-side

---

## Step 11 — Safety Reminder

**Before any test:**

- [ ] Creem API key starts with `creem_test_` (NOT live key)
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=true` is set on Preview scope ONLY
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=false` confirmed on Production scope
- [ ] Webhook endpoint URL does NOT include `redlined1.com`
- [ ] All 8 product ID vars are set

**Never:**
- Paste secrets into chat
- Commit secrets to source code or documentation
- Use live credentials in Preview or local environments
- Use test credentials in Production
