# Platform Foundation

## Overview

The platform foundation provides a centralized entitlement, billing, and permission system for Redline D1. All feature access and usage decisions flow through a single engine rather than being scattered across individual API routes.

## Architecture

```
lib/entitlements/
  planRegistry.ts       — canonical plan definitions (FREE_LIMITS, pricing, features)
  featureRegistry.ts    — canonical feature metadata and metric key definitions
  types.ts              — typed result shapes (EntitlementResult, UpgradeRecommendation, ...)
  entitlementEngine.ts  — runtime check functions (checkFeatureAccess, checkUsageAccess, ...)
  upgradeEngine.ts      — converts denials into structured upgrade recommendations
  permissionService.ts  — workspace membership + role + feature access orchestration
  index.ts              — public API re-export barrel
```

## Key Invariants

1. **No direct plan-name checks in application code.** Ask the engine instead:
   ```typescript
   const result = await checkFeatureAccess(shopId, 'repair_intelligence');
   if (!result.allowed) return 402;
   ```

2. **D1 internal shops always get full access.** `INTERNAL_SHOP_IDS` is checked first in every engine function, before any DB call or billing check.

3. **`BILLING_ENABLED=false` allows everything.** The env var `NEXT_PUBLIC_BILLING_ENABLED` defaults to `false`. Set to `true` in production Vercel environment to activate enforcement.

4. **Fail closed on infrastructure errors.** DB failures in the engine return `ENTITLEMENT_CHECK_UNAVAILABLE` with `allowed=false`, `upgradeRequired=false`, `retryable=true`. Creation and paid-feature paths are blocked until entitlement state can be verified. Never misrepresent an infra failure as a plan limit.

5. **Atomic usage reservation.** Use `reserveUsage()` before an action, `completeReservation()` on success, `releaseReservation()` on failure. Two simultaneous requests at the limit cannot both succeed. `recordUsage()` (fire-and-forget) is available for non-critical counters only.

## Plans

| Key | Price | Customers | Vehicles | Jobs/mo | AI/mo | VIN/mo | Appts/mo | DVI/mo | Storage |
|-----|-------|-----------|----------|---------|-------|--------|----------|--------|---------|
| `free` | $0 | 10 | 10 | 5 | 2 | 2 | 5 | 2 | 250 MB |
| `solo` | $29/mo | 100 | 250 | 50 | 50 | 25 | unlimited | unlimited | 2 GB |
| `starter` | $49/mo | 500 | 500 | 200 | 100 | 50 | unlimited | unlimited | 5 GB |
| `professional` | $99/mo | unlimited | 2000 | 1000 | 500 | 200 | unlimited | unlimited | 20 GB |
| `business` | $199/mo | unlimited | unlimited | unlimited | unlimited | unlimited | unlimited | unlimited | 100 GB |
| `enterprise` | custom | unlimited | unlimited | unlimited | unlimited | unlimited | unlimited | unlimited | unlimited |

## Usage Metrics

Two categories:

- **Monthly counters** (reset at calendar-month boundary): `completed_jobs`, `ai_cases`, `vin_lookups`, `appointments`, `dvi`, `sms`
- **Total-resource metrics** (never reset): `customers_total`, `vehicles_total`, `users_total`, `technicians_total`, `locations_total`, `storage_mb`

Monthly counters are stored in `usage_monthly` table; total metrics are counted live from source tables.

## Usage

### Check feature access

```typescript
import { checkFeatureAccess } from '@/lib/entitlements';

const result = await checkFeatureAccess(shopId, 'repair_intelligence');
if (!result.allowed) {
  return NextResponse.json({ error: result.userMessage }, { status: 402 });
}
```

### Atomic usage reservation (preferred for billable actions)

```typescript
import { reserveUsage, completeReservation, releaseReservation } from '@/lib/entitlements';

// idempotencyKey deduplicates retries (e.g. request ID, job ID)
const reservation = await reserveUsage(shopId, 'ai_cases', 1, idempotencyKey);
if (!reservation) {
  return NextResponse.json({ error: 'Service temporarily unavailable', retryable: true }, { status: 503 });
}
if (!reservation.allowed) {
  return NextResponse.json({ error: 'Limit reached', upgradeRequired: true }, { status: 402 });
}

try {
  await doWork();
  completeReservation(reservation.reservationId).catch(() => {}); // fire-and-forget
} catch (err) {
  releaseReservation(reservation.reservationId).catch(() => {});
  throw err;
}
```

### Get upgrade recommendation

```typescript
import { buildUpgradeRecommendation } from '@/lib/entitlements';

const denial = await checkUsageAccess(shopId, 'ai_cases', 1);
if (!denial.allowed) {
  const rec = buildUpgradeRecommendation(denial);
  // rec.recommendedPlanKey, rec.benefitsUnlocked, rec.monthlyCost, etc.
}
```

### Permission + entitlement check together

```typescript
import { authorizeWorkspaceAction } from '@/lib/entitlements';

const decision = await authorizeWorkspaceAction({
  userId,
  workspaceId: shopId,
  requiredRole: 'advisor',
  featureKey: 'ai_diagnostics',
  metricKey: 'ai_cases',
  requestedQuantity: 1,
});

if (!decision.allowed) {
  return NextResponse.json({ error: decision.reason }, { status: 403 });
}
```

## Plan Registry

The canonical plan definition lives in `lib/entitlements/planRegistry.ts`. All pricing UI, entitlement checks, and checkout flows must import from here.

```typescript
import { PLAN_REGISTRY, getPlan, minimumPlanForFeature } from '@/lib/entitlements';

const freeLimits = PLAN_REGISTRY.free.limits;
const minPlan = minimumPlanForFeature('repairIntelligence'); // 'professional'
```

## Adding a New Feature

1. Add a `FeatureKey` entry to `featureRegistry.ts`
2. Add the feature definition to `FEATURE_REGISTRY`
3. Set the feature flag on each plan in `planRegistry.ts`
4. Wire `checkFeatureAccess(shopId, 'your_feature')` in the API route
5. Add tests to `lib/__tests__/entitlements/`

## Supabase: usage_monthly table

Created by `supabase/migrations/phase_a_free_forever.sql`:

```sql
CREATE TABLE usage_monthly (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id     uuid NOT NULL,
  year_month  text NOT NULL,   -- 'YYYY-MM'
  metric      text NOT NULL,
  count       integer NOT NULL DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(shop_id, year_month, metric)
);
```

Incremented via the `increment_usage_monthly()` RPC function (atomic upsert with ON CONFLICT increment).

## Security Notes

- `INTERNAL_SHOP_IDS` (`38d55fae-741b-4bac-b520-f96eed65bf38`, `90b72748-bf01-4456-999f-f4ba48091606`) are **never** blocked — they always receive `enterprise` access.
- `BILLING_ENABLED` defaults to `false` — all checks allow everything until explicitly enabled.
- All DB queries use the service-role admin client (`getAdminDb()`), never the browser-safe client.
- `usage_monthly` RLS: shop members can read their own rows; only service role can write.
