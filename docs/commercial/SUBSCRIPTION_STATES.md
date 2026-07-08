# Subscription States

## State Machine

```
[none] → trialing → active → past_due → cancelled
                  ↘ cancelled (immediately)
                  ↘ expired (period ended, not renewed)
                  ↘ suspended (manual hold)
```

## States

| Status | Description | Shop Access |
|--------|-------------|-------------|
| `trialing` | 14-day free trial, no payment required | Full plan access |
| `active` | Paid and current | Full plan access |
| `past_due` | Payment failed, grace period active | Full access + warning banner |
| `cancelled` | Cancelled by customer or admin | Access until period end, then restricted |
| `expired` | Period ended, no renewal | Restricted (free tier only) |
| `suspended` | Manual admin hold | Restricted |
| `manual` | Managed outside Creem (e.g. invoice billing) | Full access |

## Enforcement Flag

`NEXT_PUBLIC_BILLING_ENABLED=false` → All shops treated as **active** regardless of DB state.

`subscription_enforcement` feature flag = false → Limits are advisory only (logged but not blocked).

## No Subscription Found

When `getShopSubscription()` returns null:
- If `BILLING_ENABLED=false` → treated as active
- If `BILLING_ENABLED=true` → treated as restricted (prompt to set up billing)
