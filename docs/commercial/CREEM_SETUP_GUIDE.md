# Creem Setup Guide

## Prerequisites
- Creem account at https://creem.io
- Vercel project with env var access
- Staging deployment working

---

## Step 1 — Create Products in Creem

Create 3 products (one per paid plan):

| Product Name | Description |
|---|---|
| RedlineD1 Starter | Solo mechanics and small shops |
| RedlineD1 Professional | Growing shops with multiple technicians |
| RedlineD1 Business | Full-featured multi-bay operations |

For each product, create **two prices**:
- Monthly (e.g. $49/month)
- Annual (e.g. $490/year)

---

## Step 2 — Copy Product IDs

After creating products and prices, copy each product/price ID from Creem dashboard.

---

## Step 3 — Add Env Vars to Vercel

Go to Vercel → Project Settings → Environment Variables.

Add these for **Staging** environment first:

```
BILLING_PROVIDER=creem
CREEM_API_KEY=your_creem_api_key_here
CREEM_WEBHOOK_SECRET=your_webhook_secret_here
CREEM_STARTER_MONTHLY_PRODUCT_ID=prod_xxx
CREEM_STARTER_ANNUAL_PRODUCT_ID=prod_xxx
CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID=prod_xxx
CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID=prod_xxx
CREEM_BUSINESS_MONTHLY_PRODUCT_ID=prod_xxx
CREEM_BUSINESS_ANNUAL_PRODUCT_ID=prod_xxx
NEXT_PUBLIC_BILLING_ENABLED=false
```

**Do NOT set `NEXT_PUBLIC_BILLING_ENABLED=true` yet.**

---

## Step 4 — Configure Webhook in Creem

In Creem dashboard → Webhooks → Add Endpoint:

```
URL: https://your-staging-domain.vercel.app/api/billing/webhook/creem
Events:
  - checkout.completed
  - subscription.updated
  - subscription.cancelled
  - subscription.past_due
  - payment.failed
```

Copy the webhook signing secret → add as `CREEM_WEBHOOK_SECRET`.

---

## Step 5 — Test Checkout in Staging

1. Deploy staging with env vars set
2. Open staging app as shop owner
3. Navigate to **Billing & Subscription**
4. Click **Upgrade Plan**
5. Verify redirect to Creem checkout page
6. Complete test purchase using Creem test card

---

## Step 6 — Test Webhook in Staging

1. Complete a test checkout
2. Check Supabase → `billing_events` table for the event row
3. Check `shop_subscriptions` — status should update to `active`
4. Check Creem dashboard → webhook delivery logs — should show 200 OK

---

## Step 7 — Enable Billing Feature Flag

Once checkout + webhook are verified in staging:

In Supabase (staging) SQL editor:
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'commercial_billing';
UPDATE feature_flags SET enabled = true WHERE flag_key = 'trial_system';
UPDATE feature_flags SET enabled = true WHERE flag_key = 'billing_portal';
```

---

## Step 8 — Enable Billing Env Flag in Staging

```
NEXT_PUBLIC_BILLING_ENABLED=true
```

Redeploy staging. Test full flow end-to-end again.

---

## Step 9 — Promote to Production

Only after staging is fully verified:

1. Add all env vars to Vercel **Production** environment
2. Update webhook URL in Creem to production domain
3. Set `NEXT_PUBLIC_BILLING_ENABLED=true` in production
4. Enable feature flags in production Supabase
5. Monitor `billing_events` and `shop_subscriptions` tables

---

## Step 10 — Enable Subscription Enforcement (LAST)

Only enable this after at least one successful real payment:
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'subscription_enforcement';
```

**Warning:** This activates plan limits. Test thoroughly before enabling.
