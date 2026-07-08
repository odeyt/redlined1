# Recommendation Engine

## What It Does

Runs 10 deterministic rules against live shop data to generate actionable recommendations for owners and managers. No AI. No external calls.

## How It Works

```
POST /api/intelligence/recommendations
  → generateRecommendations(shopId)
    → extractSignals(shopId)       ← DB queries for counts/totals
    → for each rule: rule.evaluate(ctx)   ← deterministic logic
    → saveRecommendations(...)     ← UPSERT on shop_id + recommendation_key
    → getOpenRecommendations(...)  ← return sorted list
```

## Deduplication

Recommendations use `(shop_id, recommendation_key)` as a unique key. Running the engine twice updates existing recommendations rather than creating duplicates.

## Lifecycle

```
open → completed   (user took action)
     → dismissed   (user dismissed)
     → expired     (> 7 days old, still open)
```

## Access Control

- **Owner / Manager**: can GET, POST (generate), PATCH (complete/dismiss)
- **Technician**: blocked (403)
- **Flag OFF**: returns `{ disabled: true, recommendations: [] }`

## API

| Method | Route | Description |
|---|---|---|
| GET | `/api/intelligence/recommendations` | Open recommendations |
| POST | `/api/intelligence/recommendations` | Generate fresh recommendations |
| PATCH | `/api/intelligence/recommendations` | Complete or dismiss |

## Feature Flag

`recommendation_engine` — default OFF.
