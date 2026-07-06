# RedlineD1 — Evidence & Reasoning Engine (ERE)

**Sprint 6 Architecture Document**

---

## Overview

The Evidence & Reasoning Engine (ERE) is a provider-agnostic reasoning layer that sits between the Knowledge Graph and any LLM. It converts raw repair case data into structured, explainable intelligence without making any AI API calls.

```
Repair Case
    ↓
Knowledge Graph (similar repairs, lessons)
    ↓
Evidence Engine  → weighted evidence objects
    ↓
Confidence Engine → explainable score 0-98%
    ↓
Recommendation Engine → ranked, evidence-backed actions
    ↓
Context Builder → clean LLMContext JSON (no PII)
    ↓
LLM (Claude / GPT / Gemini / local) — plugged in by caller
```

---

## Files

| File | Purpose |
|------|---------|
| `lib/reasoning/types.ts` | All shared TypeScript interfaces and constants |
| `lib/reasoning/EvidenceEngine.ts` | Converts repair data to weighted Evidence objects |
| `lib/reasoning/ConfidenceEngine.ts` | Computes explainable 0-98% confidence score |
| `lib/reasoning/RecommendationEngine.ts` | Generates ranked, evidence-backed recommendations |
| `lib/reasoning/ReasoningEngine.ts` | Orchestrates full pipeline with 5-step timeline |
| `lib/reasoning/ContextBuilder.ts` | Builds provider-agnostic LLMContext JSON |
| `lib/reasoning/cache.ts` | In-memory TTL cache with repair case invalidation |
| `lib/reasoning/__tests__/fixtures.ts` | Synthetic test cases (BMW, Toyota, Ford, Mercedes) |
| `lib/reasoning/__tests__/reasoning.test.ts` | Unit tests for all engines |

---

## Evidence Model

The `EvidenceEngine` collects evidence from 12 categories, each with a configurable weight:

| Evidence Type | Default Weight | Notes |
|---------------|---------------|-------|
| `gold_verified` | +150 | Highest trust — senior tech verified |
| `verified_repair` | +100 | Standard tech verification |
| `successful_repair` | +80 | Resolved without comeback |
| `oscilloscope` | +60 | High-value electrical test |
| `programming_success` | +50 | Module programming/calibration |
| `dtc_match` | +50 | Fault code match |
| `smoke_test` | +45 | Leak detection |
| `compression_test` | +45 | Mechanical integrity |
| `voltage_measurement` | +40 | Electrical measurement |
| `pressure_measurement` | +40 | Fuel/hydraulic measurement |
| `lesson_learned` | +40 | Technician captured knowledge |
| `procedure_match` | +35 | Final fix documented |
| `scope_capture` | +35 | Waveform scope recording |
| `symptom_match` | +30 | Symptom documentation |
| `part_match` | +25 | Part replacement documented |
| `comeback_penalty` | -100 | Vehicle returned — repair failed |
| `warranty_failure_penalty` | -75 | Warranty claim filed |

Weights are configurable per-shop via `weightOverrides` in `ReasoningInput`.

---

## Confidence Formula

```
BASE = 40
score = BASE
  + verification bonus  (gold: +30, verified: +18)
  + technician self-rating  (±7.5 max)
  + DTCs  (+5 each, max +15)
  + symptoms  (+3 each, max +10)
  + tests  (+2-3 each, max +12)
  + verified similar repairs  (+4 each, max +16)
  + lesson documented  (+5)
  + procedure documented  (+4)
  - comeback × 20
  - warranty × 15
  - no DTCs/symptoms  (-8)
  - no tests  (-5)
  - no similar repairs  (-6)
CLAMP to [0, 98]
```

The score is never 100 — there is always residual uncertainty in automotive diagnosis.

**Unknown risk bands:**
- `low` → ≥75%
- `medium` → 50-74%
- `high` → <50%

---

## Recommendation Strategy

`RecommendationEngine` generates recommendations from four sources, ranked by evidence score:

1. **Similar repairs** (highest weight) — grouped by `finalFix`, scored by similarity × verification × count
2. **Technician lessons** — `checkFirstNextTime` and `finalFix` from verified lessons
3. **Current case** — documented repair procedure and parts replaced
4. **DTC patterns** — standard diagnostic first-steps for well-known code ranges

Deduplication: actions are compared case-insensitively on the first 60 characters. Highest-scoring duplicate wins. Top 5 returned by default.

---

## Context Builder

`ContextBuilder.build()` outputs an `LLMContext` object that is the **only** data sent to any LLM:

- Vehicle: make, model, year, engine, transmission, mileage
- **VIN is always `null`** — shop-private, never sent to any AI provider
- Top 8 positive evidence items
- Top 3 technician lessons
- Top 5 similar repairs (sorted by similarity score)
- Top 5 recommendations
- Full confidence breakdown
- All known unknowns

`ContextBuilder.formatPrompt(context, provider)` converts the context to a provider-specific system + user message pair for Claude, OpenAI, Gemini, or local LLMs.

---

## Privacy Constraints

The ERE enforces these constraints at build time:

1. **VIN is always `null` in `LLMContext.vehicle.vin`** — set explicitly in `ContextBuilder`
2. **Evidence sanitizer** strips `customer`, `customerName`, `phone`, `email`, `address`, `vin` from evidence metadata before it enters the LLM context
3. **`share_to_network` stays false** — no cross-shop data sharing is implemented
4. **Global sharing is NOT enabled** — all graph data is shop-scoped

---

## Caching

`ERECache` is an in-memory TTL cache with four buckets:

| Bucket | TTL |
|--------|-----|
| `SIMILAR_REPAIRS` | 5 minutes |
| `CONFIDENCE` | 2 minutes |
| `RECOMMENDATIONS` | 5 minutes |
| `GRAPH_LOOKUP` | 3 minutes |

**Cache key format:**
```
ere:{repairCaseId}|{verificationStatus}|{dtcs_sorted}|{symptomCount}|{similarCount}|{confidenceScore}
```

**Invalidation:** `ReasoningEngine.invalidate(repairCaseId)` removes all cache entries whose key contains that case ID. Call this from `repairCaseService` whenever a case is updated.

---

## Performance

Target: **<200ms** for the full pipeline (pure computation, no I/O).

The 5-step timeline in `ReasoningResult.timeline` provides millisecond measurements per step for performance monitoring.

Typical performance on test fixtures:
- Evidence collection: ~1ms
- Confidence calculation: ~1ms
- Recommendation generation: ~2ms
- Context build: ~1ms
- **Total: <10ms** for a standard case

---

## Extension Points

### Sprint 7 candidates

1. **Shop-level weight configuration** — store `weightOverrides` in `shop_settings` table, load on engine instantiation
2. **Redis cache** — replace `ERECache` with Redis for multi-instance deployments (current in-memory cache is process-local)
3. **LLM integration** — wire `ContextBuilder.formatPrompt()` to Claude/GPT API calls in a new `AIAdvisor` service
4. **Streaming confidence** — stream confidence updates as graph data loads asynchronously
5. **Cross-vehicle pattern detection** — aggregate lessons across makes/models to surface universal diagnostic patterns
6. **Technician calibration** — adjust evidence weights based on historical accuracy per technician

### Adding a new evidence type

1. Add the type to `EvidenceType` union in `types.ts`
2. Add a weight to `EvidenceWeights` interface and `DEFAULT_EVIDENCE_WEIGHTS`
3. Emit the evidence in `EvidenceEngine.collect()`
4. Handle it in `ConfidenceEngine.calculate()` if it should affect the score
5. Add test coverage in `__tests__/reasoning.test.ts`

---

## Technical Debt

- `ERECache` is in-memory and process-local. In production with multiple Next.js instances, each will have its own cache. Acceptable for now — Redis is the Sprint 7 upgrade.
- Test fixtures cover 4 vehicle makes. Edge cases for electric vehicles (no combustion DTCs), diesel (different DTC ranges), and heavy trucks should be added before enabling the AI advisor in production.
- `ContextBuilder.formatPrompt()` builds prompts inline. When the AI advisor ships, prompt templates should move to versioned files to allow A/B testing without code deploys.
