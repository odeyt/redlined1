# Redlined1 — Monitoring Checklist

## Daily (< 5 minutes)

Owner or lead engineer:

- [ ] Open System Health (`Settings → System Health` or direct nav)
- [ ] Confirm `status: healthy` on all checks
- [ ] Check **Recent Errors** — are there new entries since yesterday?
- [ ] Check **Recent API Failures** — any 5xx responses?
- [ ] Check Supabase dashboard → Logs → any unusual query errors?
- [ ] Check feature flags — any unexpected changes?
- [ ] If Sentry is configured: open Sentry dashboard → check Issues for new errors

---

## Before Every Deployment

- [ ] Sentry is active (SENTRY_DSN set in Vercel for target environment)
- [ ] `/api/health` returns `status: healthy` on staging
- [ ] No new errors in staging Sentry in the last hour
- [ ] Staging smoke test passed (SMOKE_TEST_PLAN.md)
- [ ] Production Supabase backup downloaded
- [ ] Migration SQL reviewed (if applicable)
- [ ] Feature flags confirmed disabled by default in production

---

## After Every Deployment

Immediately after deploy:

- [ ] Open `https://redlined1.com/api/health` — confirm `status: healthy`
- [ ] Log in with owner account — confirm dashboard loads
- [ ] Create a test job card — confirm save works
- [ ] Open an invoice — confirm total calculates correctly
- [ ] Check Sentry dashboard for new errors (wait 5 minutes)
- [ ] Check System Health view in the app
- [ ] Watch for 15 minutes — no spike in error rate

If any check fails → initiate rollback per `ROLLBACK_GUIDE.md`.

---

## Weekly (10 minutes)

- [ ] Review all errors in Sentry from the past 7 days
- [ ] Check `/api/health` response times — any degradation?
- [ ] Review `observability_logs` for recurring warn/error patterns
- [ ] Review AI usage logs — cost within expected range?
- [ ] Check Supabase DB size — is it growing unexpectedly?
- [ ] Verify automated backups are running (Supabase → Settings → Backups)
- [ ] Review feature flags — are any experimental flags still enabled that should be disabled?

---

## Monthly

- [ ] Rotate API keys if any have been exposed (Sentry, Creem, Anthropic)
- [ ] Review Sentry error volume — upgrade plan if approaching limits
- [ ] Archive old incidents from `docs/incidents/`
- [ ] Review and update this checklist if workflows have changed
- [ ] Test rollback procedure on staging (promote previous Vercel deployment)
- [ ] Verify Supabase backup restore works on staging
