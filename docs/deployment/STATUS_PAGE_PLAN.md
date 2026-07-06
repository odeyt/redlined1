# Redlined1 — Status Page Plan

## Overview

A public or internal status page is planned for a future Epic. This document captures the requirements.

**Current status:** Not built. Planned for Epic A4 or later.

**Do NOT build until:** Sentry is configured, uptime monitoring is in place, and the shop has >5 daily active users.

---

## Planned Components

### 1. App Uptime
- Monitor `GET /` — expect 200 response
- Alert if >1 minute downtime
- Tool: Vercel built-in analytics or external (UptimeRobot, Better Stack)

### 2. Database Health
- Monitor Supabase connection pool
- Alert on >500ms average query time
- Alert on connection errors
- Source: Supabase dashboard → Logs → Database

### 3. API Health
- Monitor critical API routes:
  - `POST /api/billing/checkout`
  - `GET /api/feature-flags`
  - `POST /api/webhooks/creem`
- Alert on >5% error rate per 5-minute window

### 4. Email/SMS Health
- Monitor Resend delivery rates
- Alert on bounce rate >5%
- Future: Twilio delivery rate monitoring

### 5. Failed Jobs / Background Tasks
- Monitor webhook processing failures (`payment_events.processed = false`)
- Alert if events older than 10 minutes remain unprocessed
- Query:
  ```sql
  SELECT COUNT(*) FROM payment_events
  WHERE processed = false AND created_at < now() - interval '10 minutes';
  ```

### 6. Slow Queries
- Source: Supabase → Logs → Slow queries
- Alert threshold: >2 seconds
- Common culprits: missing indexes, full table scans

### 7. Active Incidents
- A simple internal page listing active issues
- Manually updated by lead engineer during incidents
- Future: Integrate with PagerDuty or similar

---

## Recommended Tools (Future)

| Tool | Purpose | Cost |
|---|---|---|
| UptimeRobot | Uptime monitoring + alerts | Free tier available |
| Sentry | Error tracking and performance | Free tier available |
| Better Stack | Logs + uptime + status page | Paid |
| Vercel Analytics | Web vitals | Included with Pro |

---

## Implementation Notes

When this is built:
- Status page should be at `status.redlined1.com`
- Should show green/yellow/red per component
- Should show incident history for last 30 days
- Must NOT expose any customer data
- Must work even when the main app is down (separate deployment)
