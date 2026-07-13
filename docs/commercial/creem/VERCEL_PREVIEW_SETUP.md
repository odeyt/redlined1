# Vercel Preview Deployment Setup — Creem Sandbox UAT
**Epic:** C-2.4
**Branch:** `feature/creem-sandbox-certification`

---

## Overview

This document describes how to prepare a Vercel Preview deployment that:
- Runs Creem Test Mode only
- Keeps production billing-disabled
- Is NOT aliased to redlined1.com
- Has noindex/nofollow metadata
- Exposes webhook, success, portal, and billing health routes

---

## Pre-Deployment Checklist

- [ ] `feature/creem-sandbox-certification` branch merged with `main` (to bring in C-2.2 + bug fixes)
- [ ] `npx tsc --noEmit` passes clean
- [ ] `npm run build` succeeds locally
- [ ] No live API keys anywhere in committed code
- [ ] `NEXT_PUBLIC_BILLING_ENABLED=false` still set for production scope in Vercel

---

## Routes That Must Compile

| Route | Purpose | Auth Required |
|-------|---------|---------------|
| `/api/billing/webhook/creem` | Receive Creem webhooks | No (verified by signature) |
| `/api/billing/checkout` | Create checkout session | Yes (owner) |
| `/api/billing/portal` | Customer portal redirect | Yes (owner) |
| `/billing/success` | Post-checkout confirmation | No (publicPath) |
| `/admin/billing-health` | Platform-owner metrics | Yes (admin@redlined1.com only) |
| `/pricing` | Pricing page | No |
| `/signup` | Trial signup | No |

---

## Vercel Environment Variables (Preview scope only)

Set these in Vercel Dashboard → Settings → Environment Variables → **Preview** scope.

| Variable | Required Value | Notes |
|----------|---------------|-------|
| `CREEM_API_KEY` | `creem_test_...` | From Creem Test Mode → API Keys |
| `CREEM_WEBHOOK_SECRET` | `whsec_test_...` | From Creem Test Mode → Webhooks |
| `CREEM_TEST_MODE` | `true` | Must be string "true" |
| `PAYMENT_PROVIDER` | `creem` | Activates Creem provider factory |
| `BILLING_PROVIDER` | `creem` | Legacy compat |
| `NEXT_PUBLIC_BILLING_ENABLED` | `true` | Preview only — enables billing UI |
| `CREEM_SOLO_MONTHLY_PRODUCT_ID` | `prod_test_...` | From Creem Test Mode dashboard |
| `CREEM_SOLO_ANNUAL_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_STARTER_MONTHLY_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_STARTER_ANNUAL_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_PROFESSIONAL_ANNUAL_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_BUSINESS_MONTHLY_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_BUSINESS_ANNUAL_PRODUCT_ID` | `prod_test_...` | |
| `CREEM_SUCCESS_URL` | `https://<preview-host>/billing/success` | Replace with actual Preview URL |
| `CREEM_CANCEL_URL` | `https://<preview-host>/pricing` | Replace with actual Preview URL |
| `PLATFORM_OWNER_EMAIL` | `admin@redlined1.com` | For billing health dashboard auth |

**Production scope MUST have:**
| Variable | Required Value |
|----------|---------------|
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` |

---

## Deployment Steps

1. **Push the branch** (requires Odey authorization):
   ```
   git push origin feature/creem-sandbox-certification
   ```

2. **Vercel auto-creates a Preview** from any non-main branch push.

3. **Note the Preview URL** (format: `redlined1-git-creem-sandbox-certification-xxx.vercel.app`)

4. **Set env vars** in Vercel → Settings → Environment Variables → Preview scope

5. **Register webhook** in Creem Test Mode:
   - URL: `https://<PREVIEW_HOST>/api/billing/webhook/creem`
   - See `CREEM_TEST_DASHBOARD_RUNBOOK.md` Step 6

6. **Update `CREEM_SUCCESS_URL` and `CREEM_CANCEL_URL`** to use the actual Preview host

7. **Redeploy** (Vercel dashboard → Deployments → Redeploy, or push an empty commit)

8. **Verify** by visiting `<PREVIEW_URL>/admin/billing-health` as `admin@redlined1.com`

---

## Security Requirements

- Preview URL must NOT be aliased or CNAME'd to `redlined1.com`
- The `/landing-preview` route already has `robots: noindex, nofollow` in its layout metadata
- Add `robots` metadata to the Preview's root layout if needed (the main app layout does not have it — this is acceptable since Preview URLs are not indexed by default)

---

## What Remains Unchanged in Production

| Item | Production Value | Notes |
|------|-----------------|-------|
| `NEXT_PUBLIC_BILLING_ENABLED` | `false` | Never change without canary approval |
| `PAYMENT_PROVIDER` | not set | Production routes throw 403 before reaching provider |
| Billing routes | Deployed but gated | 403 on all requests |
| D1 shop access | Fully operational | Unaffected by billing state |
