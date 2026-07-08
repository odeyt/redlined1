# Owner Command Center — Plan

> **Status**: Types and API contract defined. No UI built. No dashboard.

## Purpose

The Owner Command Center is a future dashboard giving shop owners a single-screen view of shop health, revenue, open repair orders, and intelligence recommendations. This document defines the contract so that future epics can build the UI without changing the API shape.

## API Endpoints (Future)

| Endpoint                          | Method | Description                       |
|-----------------------------------|--------|-----------------------------------|
| `/api/intelligence/summary`       | GET    | Daily summary for today           |
| `/api/intelligence/summary?date=` | GET    | Daily summary for a specific date |
| `/api/intelligence/briefing`      | GET    | Morning briefing                  |
| `/api/intelligence/health`        | GET    | Provider health check (built)     |

## Data Shape

Responses use the `DailySummaryData` and `MorningBriefingData` types from `intelligence/types/index.ts`.

## Feature Flag

The `command_center` flag gates all Command Center endpoints. Default: `false`.

## What Is NOT Built Yet

- Dashboard UI
- Charts or trend lines
- Real data aggregation (current: zero-baseline)
- Email/push delivery of briefings

These are left for future epics once the flag is enabled and a real provider is wired in.
