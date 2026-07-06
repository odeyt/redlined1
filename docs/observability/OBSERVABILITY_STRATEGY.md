# Redlined1 — Observability Strategy

## Goal

If Redlined1 fails during business hours, the owner knows within minutes — not hours.

---

## Architecture Overview

```
Browser (client errors)
  ↓ ErrorBoundary → Sentry + observability_logs
  
API Routes (server errors)
  ↓ apiMonitor wrapper → logger → Sentry + observability_logs

Feature Flags (toggle events)
  ↓ FeatureFlagsPanel → logFeatureFlagEvent → observability_logs

Health Check
  ↓ GET /api/health → System Health view

All logs → Sentry (if DSN set) + Supabase observability_logs table
```

---

## 1. Runtime Error Tracking

**Tool:** Sentry (`@sentry/nextjs`)

- Client-side crashes caught by `ErrorBoundary` → `Sentry.captureException()`
- Server-side exceptions caught by `apiMonitor` wrapper
- Sentry initialized only when `SENTRY_DSN` is set — no crash if missing
- Environment tagged on every event (`development` / `staging` / `production`)

**Priority errors to alert on:**
- Any uncaught exception in production
- API routes returning 5xx
- `ErrorBoundary` triggered on core modules (job-cards, invoices, payments)

---

## 2. API Error Tracking

**Tool:** `lib/observability/apiMonitor.ts`

Wraps API route handlers to capture:
- Route path + HTTP method
- Response status code
- Duration (ms)
- Error message and stack on 5xx
- User ID and Shop ID from auth context

Applied to critical routes:
- `/api/ai`
- `/api/job-status`
- `/api/job-notify`
- `/api/inspection-approve`
- `/api/inspection-email`
- `/api/labor-guide`
- `/api/members`

---

## 3. Frontend Crash Tracking

**Tool:** `ErrorBoundary` + Sentry

Every React tree is wrapped in `ErrorBoundary`. On crash:
1. `componentDidCatch` fires
2. `logger.error()` writes to console
3. `Sentry.captureException()` sends to Sentry with context:
   - error message + stack
   - component stack
   - current environment
   - user ID + shop ID (from localStorage/cookie)
4. User sees safe message: "Something went wrong. Please reload."
5. Stack trace hidden in production

---

## 4. Server-Side Logging

**Tool:** `lib/logger.ts` + `lib/observability/logger.ts`

Log levels: `debug` (dev only) | `info` | `warn` | `error`

All logs are structured JSON with:
- timestamp (ISO 8601)
- level
- message
- optional context (module, userId, shopId — no PII)

**PII policy:**
- Never log customer name, phone, email, address
- Never log VIN in logs sent to Sentry
- Never log payment card data
- User IDs (UUIDs) are acceptable
- Shop IDs are acceptable

---

## 5. Health Checks

**Endpoint:** `GET /api/health`

Checks:
- App: always `true` (if responding, app is up)
- Supabase: lightweight count query
- Feature flags: table accessibility
- Email: `RESEND_API_KEY` configured?
- SMS: `TWILIO_*` configured?
- AI: `ANTHROPIC_API_KEY` configured?

**Response time target:** < 500ms

**Used by:**
- System Health view (owner only)
- Future uptime monitoring (UptimeRobot etc.)
- Smoke test checklist

---

## 6. Deployment Monitoring

After every deploy:
1. Check `/api/health` returns `status: "healthy"`
2. Run smoke test (SMOKE_TEST_PLAN.md)
3. Watch Sentry for new errors for 15 minutes
4. Watch System Health view for API failures

Vercel deployment logs available at: Vercel dashboard → Deployments → Functions tab

---

## 7. Feature Flag Monitoring

When any feature flag is toggled:
- Logged to `observability_logs` with event_type `flag_toggle`
- Metadata includes: flag_key, old_value, new_value, scope, user_id, shop_id
- Visible in System Health view under recent events

---

## 8. Future AI Cost Monitoring

The `/api/ai` route already logs `input_tokens`, `output_tokens`, and `estimated_cost` per request to Supabase. Future work:

- Aggregate by shop/day in `observability_logs`
- Add `logPerformanceMetric('ai_cost', { usd, tokens, model })` calls
- Build cost dashboard in System Health view

---

## 9. Alerting Strategy

| Trigger | Alert Method |
|---|---|
| Sentry error in production | Sentry email alert (configure in Sentry dashboard) |
| `/api/health` returns unhealthy | UptimeRobot alert (future) |
| 5+ errors in 5 minutes | Sentry alert rule |
| DB connection failure | Sentry + health check |

**Immediate action:** Sentry → email to shop owner.
**Future:** Slack/SMS alerting via Sentry integrations.

---

## 10. Incident Response

See `INCIDENT_RESPONSE_PLAYBOOK.md` for step-by-step response procedures.

---

## Observability Provider

Current: **Sentry** (free tier supports 5,000 errors/month)

Future alternatives if Sentry grows expensive:
- Highlight.io (open source)
- Axiom (structured logs)
- Self-hosted Grafana + Loki
