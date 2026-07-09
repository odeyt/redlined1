# Sapelee Connector (SI-8)

RedlineD1 supports an optional external Intelligence Provider called **Sapelee**.
The system operates identically with Sapelee disabled — all features are feature-flagged and default OFF.

## Architecture

```
RedlineD1 Intelligence Layer
        |
   IntelligenceProvider (interface)
        |
  ┌─────────────────────────┐
  │  MockIntelligenceProvider│  ← default (always safe)
  └─────────────────────────┘
  ┌─────────────────────────┐
  │ SapeleeIntelligenceProvider│  ← optional, via INTELLIGENCE_PROVIDER=sapelee
  └─────────────────────────┘
```

RedlineD1 **never** directly imports Sapelee classes. All access is through the `IntelligenceProvider` interface.
The `SapeleeIntelligenceProvider` is dynamically required at runtime only when `INTELLIGENCE_PROVIDER=sapelee`.

## Files

| File | Purpose |
|------|---------|
| `intelligence/provider/sapelee/SapeleeClient.ts` | HTTP client, 8s timeout, all endpoints |
| `intelligence/provider/sapelee/SapeleePayloadBuilder.ts` | PII-safe payload construction |
| `intelligence/provider/sapelee/SapeleeIntelligenceProvider.ts` | Provider impl + `enhanceMorningBriefWithSapelee` |
| `intelligence/provider/factory.ts` | Singleton factory, dynamic require, env check |
| `intelligence/morning-brief/MorningBriefEngine.ts` | Enhancement hook (`trySapeleeEnhancement`) |
| `supabase/migrations/migration_sapelee_flags.sql` | Feature flags (all OFF by default) |

## Configuration

Add to `.env.local`:

```env
INTELLIGENCE_PROVIDER=sapelee
SAPELEE_API_URL=https://api.sapelee.com
SAPELEE_API_KEY=your-key-here
SAPELEE_COMPANY_ID=your-company-id
NEXT_PUBLIC_SAPELEE_ENABLED=true
```

Without these, the system automatically falls back to `MockIntelligenceProvider` with a console warning.

## Feature Flags

All flags default `false`. Flip individually in Supabase `feature_flags` table.

| Flag | Effect |
|------|--------|
| `sapelee_provider` | Enables Sapelee as the active provider |
| `sapelee_morning_brief_enhancement` | Sends morning brief to Sapelee for enhancement |
| `sapelee_event_sync` | Syncs anonymized operational events |
| `sapelee_owner_coaching` | Shows owner coaching panel in Command Center |

## Safety Guarantees

- RedlineD1 **never blocks** on Sapelee. All calls are fire-and-forget or have an 8s hard timeout.
- Local brief is always generated first. Sapelee enhancement is additive only.
- If Sapelee fails, times out, or returns an error, the local brief is kept unchanged.
- Every Sapelee call is wrapped in try/catch — exceptions never propagate to the UI.
