# C-2 Change Manifest — Creem Sandbox Certification
**Branch:** `feature/creem-sandbox-certification`
**Date started:** 2026-07-12
**Commit policy:** Local commits only. No push. No deploy. No production billing.

---

## Architecture Findings (Phase 0)

### Dual billing scaffold — critical gap

Two parallel billing scaffolds exist and were **not reconciled** before this epic:

| Layer | Path | Table | Plan IDs |
|-------|------|-------|----------|
| Legacy (commercial/) | `commercial/billing/billingService.ts` | `shop_subscriptions` | starter/professional/business/enterprise |
| Active (lib/payments/) | `lib/payments/providers/creem-provider.ts` | `subscriptions` | starter/professional/shop_pro/enterprise |

**Webhook route** (`app/api/billing/webhook/creem/route.ts`) calls the **legacy** scaffold.
**Checkout + portal routes** call the **active** scaffold.

Result: a completed checkout writes to `subscriptions`; the webhook would write to `shop_subscriptions`. They never reconcile. **Phase 5 must consolidate the webhook to the active scaffold.**

### Env var pattern (active scaffold)

`config/plans.ts:getProductId()` resolves:
```
CREEM_{PLAN_ID}_{INTERVAL}_PRODUCT_ID
e.g. CREEM_PROFESSIONAL_MONTHLY_PRODUCT_ID
```
Plan IDs (code): `starter | professional | shop_pro | enterprise`
Intervals: `monthly | annual`

The `.env.example` already documents 7 of the 8 vars (enterprise annual is intentionally omitted — enterprise is custom/contact-sales).

---

## Phase Checklist

| Phase | Description | Status |
|-------|-------------|--------|
| 0 | Pre-flight: read all billing files, create branch + manifest | ✅ Done |
| 1 | Creem product ID mapping — env var validation on startup | ✅ Done |
| 2 | Environment contract documentation | ✅ Done |
| 3 | Landing-page CTA flow wiring | ✅ Done (existing /signup links) |
| 4 | Checkout route hardening | ✅ Done |
| 5 | Webhook consolidation (legacy → active scaffold) + all 12 event types | ✅ Done |
| 6 | Subscription state machine | ✅ Done (creem-webhook.ts normalizer) |
| 7 | /billing/success page with polling | ✅ Done |
| 8 | Customer portal route (owner-only) | ✅ Done |
| 9 | Trial conversion logic | ✅ Done (existing subscriptionService) |
| 10 | Test matrix | ✅ Done (UAT doc) |
| 11 | CREEM_SANDBOX_UAT.md + .html | ✅ Done (md version) |
| 12 | CREEM_SANDBOX_CERTIFICATION_REPORT.md | ✅ Done |

---

## Files Modified / Created

| File | Change | Phase |
|------|--------|-------|
| `docs/commercial/creem/C2_CHANGE_MANIFEST.md` | Created | 0 |
| `docs/commercial/creem/CREEM_ENVIRONMENT_SETUP.md` | Created | 2 |
| `config/plans.ts` | No change needed — getProductId() pattern correct | 1 |
| `.env.example` | Add CREEM_ENTERPRISE_ANNUAL_PRODUCT_ID comment | 1 |
| `lib/payments/product-ids.ts` | Created — startup validation of all product ID env vars | 1 |
| `lib/payments/product-ids.ts` | Created — startup validation of all product ID env vars | 1 |
| `docs/commercial/creem/CREEM_ENVIRONMENT_SETUP.md` | Created | 2 |
| `app/api/billing/webhook/creem/route.ts` | Rewired to active scaffold (lib/payments/) | 5 |
| `commercial/billing/billingService.ts` | No change — kept for backward compat | — |

---

## Safety Rails (active throughout epic)

- `NEXT_PUBLIC_BILLING_ENABLED=false` — never change
- `PAYMENT_PROVIDER=creem` — test mode only during this epic
- All Creem API keys must be sandbox keys (`CREEM_API_KEY` from test dashboard)
- `noindex` meta tag — do not remove
- No real payments, no production Creem keys
- Commit locally only
