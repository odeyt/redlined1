# Billing Architecture

## Layer Overview

```
App Code (features/, api/)
        ↓
billingService.ts          ← THE ONLY ENTRY POINT
        ↓
IBillingProvider interface
        ↓
creemProvider.ts           ← Creem implementation (swappable)
        ↓
Creem API
```

## Key Files

| File | Purpose |
|------|---------|
| `commercial/billing/billingService.ts` | Public API — only file app code imports |
| `commercial/providers/BillingProvider.ts` | Interface all providers must implement |
| `commercial/providers/creemProvider.ts` | Creem implementation with TODO markers |
| `commercial/subscriptions/subscriptionService.ts` | Shop subscription CRUD |
| `commercial/licensing/licenseService.ts` | License checks (always fail-safe) |
| `commercial/usage/usageService.ts` | Usage metering |
| `commercial/plans/planManager.ts` | Plan definitions and limits |
| `commercial/shared/types.ts` | All shared types |
| `commercial/shared/featureFlags.ts` | Commercial feature flag keys |
| `commercial/trials/onboardingHook.ts` | Called on shop creation |
| `commercial/plans/publicPricing.ts` | Landing page pricing data |

## Database Tables

| Table | Purpose |
|-------|---------|
| `commercial_plans` | Plan definitions seeded from migration |
| `shop_subscriptions` | One row per shop, current subscription state |
| `billing_events` | All webhook events (raw + processed flag) |
| `usage_records` | Per-period usage metering rows |
| `license_checks` | Audit log of license check results |

## Safety Rules

1. `NEXT_PUBLIC_BILLING_ENABLED=false` → all checks pass, no blocking
2. Webhook route never requires auth (Creem POSTs to it)
3. Webhooks are idempotent — duplicate `provider_event_id` is skipped
4. `licenseService` always returns `allowed: true` on error
5. Shop creation succeeds even if trial subscription creation fails

## Adding a New Provider

1. Create `commercial/providers/stripeProvider.ts` implementing `IBillingProvider`
2. Register it in `billingService.ts` `PROVIDERS` map
3. Set `BILLING_PROVIDER=stripe` in env
4. No other code changes needed
