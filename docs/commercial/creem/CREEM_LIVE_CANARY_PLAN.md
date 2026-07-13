# Creem Live Canary Plan
**Epic:** C-2.4
**Gate:** Requires SANDBOX CERTIFIED + Creem account approved + live products + live webhook configured

---

## ⛔ DO NOT PERFORM THE LIVE PURCHASE WITHOUT EXPLICIT WRITTEN AUTHORIZATION FROM ODEY.

---

## Canary Sequence

### Stage 1 — Pre-Canary Deployment

1. Deploy production code with `NEXT_PUBLIC_BILLING_ENABLED=false`
2. Verify `npm run build` passes with live env vars (no billing UI exposed)
3. Verify `/api/billing/webhook/creem` rejects unsigned requests:
   ```
   POST /api/billing/webhook/creem (no signature)
   Expected: 400 {"error":"Invalid signature"}
   ```
4. Confirm live webhook is registered in Creem Live Mode
5. Confirm `www.redlined1.com` is the webhook URL (NOT a preview URL)

### Stage 2 — D1 Shop Verification

6. Log in as D1 owner (Shop 1 and Shop 2)
7. Confirm both shops are fully operational: Job Cards, Estimates, Repair Orders, Invoices
8. Confirm POST `/api/billing/checkout` returns 403 for D1 shops even if billing is enabled
9. Confirm no trial watermark visible for D1 shops

### Stage 3 — Allowlist One Canary Account

10. Create one external canary test account (not a D1 shop owner)
    - Use a real email address you control
    - This account will complete one live Solo monthly purchase at $24
11. Enable billing only for this account using the server-side rollout allowlist
    - This does NOT require setting `NEXT_PUBLIC_BILLING_ENABLED=true` globally
    - The allowlist is checked server-side in the checkout route before the billing flag

### Stage 4 — Live Transaction

**Requires explicit authorization from Odey before executing.**

12. Log in as the canary account
13. POST `/api/billing/checkout` with `{ planId: "solo", billingInterval: "monthly" }`
14. Navigate to checkout URL in browser
15. Complete payment with a **real payment method** (the canary account will be charged $24)
16. Confirm redirect to `/billing/success`
17. Confirm `/billing/success` shows `status: active`

### Stage 5 — Verify in Creem

18. Log in to Creem Live Mode dashboard
19. Confirm a payment of $24 appears
20. Confirm subscription is created for the canary customer
21. Record the payment ID (masked: first 4 chars only, e.g. `sub_xxxx`)

### Stage 6 — Verify Webhook

22. Confirm Creem fired `checkout.completed` webhook to production
23. Check server logs for `[webhook/creem]` entries
24. Confirm webhook returned 200
25. Confirm `payment_events` table has one row with `processed = true`

### Stage 7 — Verify Subscription

26. Confirm `subscriptions` table has one row with:
    - `plan_id = 'solo'`
    - `billing_interval = 'monthly'`
    - `status = 'active'`
    - `provider = 'creem'`

### Stage 8 — Verify Entitlements

27. Confirm canary account can access Solo-tier features
28. Confirm canary account cannot access Professional/Business-only features
29. Confirm trial watermark is removed (if it was showing during trial)

### Stage 9 — Verify Portal

30. POST `/api/billing/portal` as canary account
31. Navigate to portal URL — confirm it opens Creem customer portal
32. Schedule cancellation (to verify cancellation webhook)
33. Confirm `subscription.canceled` webhook fires
34. Confirm `subscriptions` table updates to `cancel_at_period_end = true`

### Stage 10 — Monitor

35. Monitor for at least one full review window (24 hours minimum)
36. Check for unexpected charges, duplicate webhooks, or access issues
37. Verify billing analytics reflect the event in `/admin/billing-health`

---

## Immediate Stop Conditions (Rollback Triggers)

If ANY of the following occur, stop the canary immediately:

| Condition | Action |
|-----------|--------|
| Paid customer remains on trial | Rollback + manual fix |
| Wrong plan activated | Rollback + manual fix |
| Webhook signature verification fails | Rollback |
| Webhook not received | Rollback |
| Duplicate subscription created | Rollback |
| Subscription status in DB doesn't match Creem | Rollback |
| Trial watermark still visible after payment | Rollback + manual fix |
| D1 shop access affected | Rollback immediately |
| Unknown product ID grants access | Rollback |
| Production uses test endpoint/key | Rollback immediately |
| Checkout accessible outside allowlist | Rollback |
| Billing analytics disagree with source | Investigate |

---

## Rollback Procedure

1. Set `NEXT_PUBLIC_BILLING_ENABLED=false` in Vercel Production → Redeploy
2. Remove canary account from server-side allowlist
3. Preserve all `payment_events` and `subscriptions` records — do NOT delete
4. Manually restore the canary customer's correct entitlement if affected
5. If D1 shops affected: revert entire billing code deployment
6. Document incident in `INCIDENT_LOG.md`

---

## After Successful Canary

Only after all 10 stages pass without any stop condition:

1. Enable public checkout for all shops: `NEXT_PUBLIC_BILLING_ENABLED=true` in Production
2. Announce launch to users
3. Monitor for 7 days

Do not enable public checkout without Odey's explicit authorization.
