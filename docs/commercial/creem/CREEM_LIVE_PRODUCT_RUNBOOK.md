# Creem Live Product Setup Runbook
**Epic:** C-2.4
**Gate:** Only execute AFTER sandbox certification is SANDBOX CERTIFIED AND Creem merchant account is approved.

---

## ⛔ DO NOT PROCEED until SANDBOX CERTIFIED status is confirmed in CREEM_FINAL_SANDBOX_CERTIFICATION.md

---

## Step 1 — Confirm Creem Account Approval

1. Check your email for a Creem merchant account approval notification
2. Log in to https://app.creem.io → verify account status shows "Approved" or "Active"
3. Confirm you can access Live Mode (not just Test Mode)
4. Record approval date in `CREEM_MERCHANT_ELIGIBILITY.md`

---

## Step 2 — Switch to Live Mode

1. Log in to Creem dashboard
2. Locate the **Test Mode** toggle (top-right) — currently orange/yellow
3. Click to switch to **Live Mode** — confirm the toggle shows "Live"
4. Verify the dashboard no longer shows the "Test Mode" indicator

**Test products, keys, customers, transactions, and webhooks are completely separate from Live Mode.**
Do NOT copy test product IDs into production variables.

---

## Step 3 — Create Eight Live Products

Create exactly these 8 products in Creem **Live Mode**.
These are separate from the 8 test products created earlier.

| # | Product Name | Interval | Price (USD) |
|---|-------------|----------|-------------|
| 1 | RedlineD1 Solo Monthly | Monthly | $24.00 |
| 2 | RedlineD1 Solo Annual | Annual | $240.00 |
| 3 | RedlineD1 Starter Monthly | Monthly | $49.00 |
| 4 | RedlineD1 Starter Annual | Annual | $490.00 |
| 5 | RedlineD1 Professional Monthly | Monthly | $99.00 |
| 6 | RedlineD1 Professional Annual | Annual | $990.00 |
| 7 | RedlineD1 Business Monthly | Monthly | $179.00 |
| 8 | RedlineD1 Business Annual | Annual | $1,790.00 |

Enterprise: no product — contact sales only (`admin@redlined1.com`).

---

## Step 4 — Record Eight Live Product IDs

For each product:
1. Open the product in Creem Live Mode
2. Copy the Product ID (live IDs do NOT start with `prod_test_`)
3. Record which env var corresponds to each (do not paste into chat or code):

| Env Var | Live Product ID |
|---------|----------------|
| `CREEM_SOLO_MONTHLY_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_SOLO_ANNUAL_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_STARTER_MONTHLY_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_STARTER_ANNUAL_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` | (copy from Creem Live) |
| `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` | (copy from Creem Live) |

---

## Step 5 — Retrieve Production API Key

1. Creem Dashboard → Settings → API Keys (in Live Mode)
2. Copy the **Live Mode API key** (does NOT start with `creem_test_`)
3. This will go into `CREEM_API_KEY` for the **Production** Vercel environment
4. Never commit this key to source code

---

## Step 6 — Register Production Webhook

1. Creem Dashboard → Developers → Webhooks → Add Endpoint
2. URL: `https://www.redlined1.com/api/billing/webhook/creem`
3. Subscribe to all 9 events:
   - `checkout.completed`
   - `subscription.created`
   - `subscription.updated`
   - `subscription.canceled`
   - `subscription.expired`
   - `subscription.past_due`
   - `subscription.renewed`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Save endpoint

---

## Step 7 — Retrieve Production Webhook Secret

1. Creem → Developers → Webhooks → your production endpoint
2. Click **Reveal Signing Secret**
3. Copy the live webhook secret
4. This goes into `CREEM_WEBHOOK_SECRET` for the **Production** Vercel environment
5. Never paste into chat or commit to code

---

## Step 8 — Verify Support Email

Confirm that `support@redlined1.com` (or whichever email is registered with Creem):
- Is active and receiving email
- Matches exactly what is registered in Creem Business Details
- Is listed in your Privacy Policy and Terms of Service

---

## Step 9 — Verify Customer Portal

Test that the customer portal is accessible:
1. In Creem Live Mode, confirm the Customer Portal is enabled
2. Verify `/api/billing/portal` returns a working portal URL
3. Confirm customers can cancel from the portal

---

## Step 10 — Verify Pricing and Legal Pages

Confirm these routes are live at `www.redlined1.com`:
- [ ] `/landing-preview` (or `/`) — pricing section visible
- [ ] `/terms` — Terms of Service
- [ ] `/privacy` — Privacy Policy
- [ ] `/refund-policy` — Refund and Cancellation Policy
- [ ] Footer contains `support@redlined1.com` link

---

## After This Runbook

Proceed to `CREEM_LIVE_CANARY_PLAN.md` for the controlled live transaction.

**Do NOT enable `NEXT_PUBLIC_BILLING_ENABLED=true` in production until the canary plan is approved by Odey.**
