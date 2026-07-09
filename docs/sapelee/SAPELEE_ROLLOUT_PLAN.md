# Sapelee Rollout Plan (SI-8)

All Sapelee features are built and deployed but **disabled by default**.
Use this plan to enable them incrementally.

## Prerequisites

- [ ] Obtain Sapelee API credentials (API URL, API key, company ID)
- [ ] Confirm Sapelee endpoint paths with Sapelee team (see TODO markers in `SapeleeClient.ts`)
- [ ] Set environment variables in Vercel project settings

## Environment Variables

```env
INTELLIGENCE_PROVIDER=sapelee
SAPELEE_API_URL=https://api.sapelee.com
SAPELEE_API_KEY=<from Sapelee dashboard>
SAPELEE_COMPANY_ID=<from Sapelee dashboard>
NEXT_PUBLIC_SAPELEE_ENABLED=true
```

## Rollout Phases

### Phase 1 — Health Check Only
Enable nothing. Deploy with env vars set. Verify `/api/health/intelligence` shows:
```json
{ "sapelee": { "configured": true, "status": "ok" } }
```

### Phase 2 — Morning Brief Enhancement (lowest risk)
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'sapelee_morning_brief_enhancement';
```
Generates a morning brief, waits ~8s, checks `morning_briefs.metadata` for `sapelee_enhancement`.
Roll back by setting `enabled = false` — no data is modified, local brief is unchanged.

### Phase 3 — Event Sync
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'sapelee_event_sync';
```
Sends anonymized operational events (job completions, invoice events, etc.) to Sapelee.
All events are fire-and-forget — never blocks production workflow.

### Phase 4 — Owner Coaching Panel
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'sapelee_owner_coaching';
```
Shows the owner coaching panel in Command Center when enhancement data is available.

### Phase 5 — Full Provider Mode (optional)
```sql
UPDATE feature_flags SET enabled = true WHERE flag_key = 'sapelee_provider';
```
Switches the active `IntelligenceProvider` from mock to Sapelee for all recommendations.
This changes the source of `getRecommendations()` and `generateDailySummary()`.

## Rollback

Any phase can be rolled back instantly by setting the flag to `false` in Supabase.
No code deployment required. No data is lost — local briefs are always preserved.

## Monitoring

- `/api/health/intelligence` — Sapelee connectivity status
- `morning_briefs.metadata.sapelee_enhancement` — enhancement presence per brief
- Vercel function logs — search `[Intelligence]` or `[Sapelee]` for adapter messages

## TODO Before Go-Live

- [ ] Confirm `/api/external/events` request schema with Sapelee team
- [ ] Confirm `/api/external/morning-brief/enhance` request/response schema
- [ ] Confirm `/api/external/executive-advice` request/response schema
- [ ] Confirm `/api/external/health` response shape
- [ ] Run Phase 1 health check on staging before enabling any flag
