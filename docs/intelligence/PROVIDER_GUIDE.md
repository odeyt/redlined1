# Intelligence Provider Guide

## How to Add a New Provider

1. Create a class in `intelligence/` implementing the `IntelligenceProvider` interface from `intelligence/types/index.ts`.
2. Add the env var key to the `switch` in `intelligence/provider/factory.ts`.
3. Set `INTELLIGENCE_PROVIDER=<your-key>` in `.env`.
4. The factory wires the provider's `publishEvent` into `EventPublisher` automatically.

### Provider Interface

```typescript
interface IntelligenceProvider {
  readonly name: string;
  publishEvent(event: IntelligenceEvent): Promise<void>;
  generateDailySummary(shopId: string, date: string): Promise<DailySummaryData>;
  generateMorningBriefing(shopId: string): Promise<MorningBriefingData>;
  getRecommendations(shopId: string): Promise<Recommendation[]>;
  health(): Promise<HealthStatus>;
}
```

### Rules

- All methods must return within 5 seconds (add your own timeout).
- `publishEvent` must be idempotent — the same `eventId` may arrive more than once.
- `health()` must always resolve (never reject). Return `status: 'offline'` on failure.
- Never call these methods directly. Always go through `IntelligenceService`.

## Environment Variables

| Variable               | Values                                      | Default |
|------------------------|---------------------------------------------|---------|
| `INTELLIGENCE_PROVIDER`| `mock`, `sapelee`, `openai`, `claude`, `gemini` | `mock`  |

Unknown values silently fall back to `mock` with a console warning — never crash.

## Current Providers

| Key      | File                                                  | Status       |
|----------|-------------------------------------------------------|--------------|
| `mock`   | `intelligence/mock/MockIntelligenceProvider.ts`       | Default      |
| `sapelee`| —                                                     | Future epic  |
| `openai` | —                                                     | Future epic  |
| `claude` | —                                                     | Future epic  |
| `gemini` | —                                                     | Future epic  |
