# Restore Procedure — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

---

## Pre-Restore Checklist

Before starting any restore:

- [ ] Identify the incident type (see INCIDENT_RUNBOOK.md)
- [ ] Confirm current production status
- [ ] Identify the last known-good state (backup time / git commit)
- [ ] Notify affected users if downtime > 5 minutes
- [ ] Document the incident start time

---

## Restore Order

Always restore in this priority order:

```
1. Database         ← Nothing works without it
2. Env Variables    ← App won't start without correct keys
3. Storage          ← Files; non-blocking for core workflows
4. Feature Flags    ← Safe defaults if absent
5. Deployment       ← Roll back Vercel if code is broken
6. Knowledge Graph  ← Rebuild from job history if needed
7. Repair Intel     ← Rebuild from data if needed
8. AI Config        ← Re-add API keys to Vercel env
```

---

## Procedure 1 — Database Point-in-Time Restore

**Use when:** Data deleted, corrupted, or bad migration applied.

**Time estimate:** 2–5 minutes

```
1. Go to: https://supabase.com/dashboard/project/<project-id>/database/backups
2. Click "Point in Time Recovery"
3. Select restore time (just before the incident)
4. Confirm restore — this REPLACES the current database
5. Wait for restore to complete (1–3 min)
6. Verify: GET https://redlined1.com/api/health → supabase: OK
7. Verify: Log in and confirm customer/job data is present
8. If migration is out of sync, re-run missing migrations from git
```

**Warning:** PITR replaces the live database. Make sure no critical data was written
AFTER the target restore point that you want to keep.

---

## Procedure 2 — Vercel Rollback

**Use when:** Bad deployment broke the app.

**Time estimate:** < 2 minutes

```
1. Go to: https://vercel.com/odeyt/redlined1/deployments
2. Find the last known-good deployment (green checkmark)
3. Click "..." → "Promote to Production"
4. Confirm promotion
5. Verify: https://redlined1.com loads correctly
6. Test login and core workflow
```

**Note:** This rolls back code only, not the database.

---

## Procedure 3 — Environment Variable Recovery

**Use when:** App failing to start, Supabase connection errors, payment/email broken.

**Time estimate:** 5–10 minutes

```
1. Go to: https://vercel.com/odeyt/redlined1/settings/environment-variables
2. Re-enter missing variables (from offline backup in password manager)
3. Required variables:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY
   - CREEM_API_KEY
   - RESEND_API_KEY
   - NEXT_PUBLIC_APP_URL = https://redlined1.com
4. Trigger a new deployment (or redeploy last build)
5. Verify: GET /api/health → all checks pass
```

---

## Procedure 4 — Feature Flag Reset

**Use when:** Feature flag table corrupted or deleted.

**Time estimate:** < 2 minutes

```
1. Open Supabase SQL Editor
2. Run: supabase/migration_feature_flags.sql (CREATE TABLE IF NOT EXISTS + seeds)
3. Verify: GET /api/feature-flags → returns flags object
4. All flags will be OFF (safe default — this is correct)
5. Re-enable specific flags from Settings → Feature Flags panel
```

---

## Procedure 5 — Full Rebuild from Git

**Use when:** Complete environment loss.

**Time estimate:** 15–30 minutes

```
1. Clone repository:
   git clone https://github.com/odeyt/redlined1.git

2. Create new Supabase project at supabase.com

3. Run migrations in order (see MIGRATION_REGISTRY.md):
   - migration_billing.sql
   - migration_feature_flags.sql
   - migration_observability_logs.sql
   - (all others in documented order)

4. Create new Vercel project, connect to GitHub repo

5. Set all environment variables in Vercel

6. Deploy from main branch

7. Verify /api/health → all checks pass

8. Restore database from Supabase backup if available

9. Test complete workflow end-to-end
```

---

## Post-Restore Verification

After any restore procedure:

- [ ] `GET /api/health` returns status: healthy
- [ ] Login works for owner account
- [ ] Customer list loads
- [ ] Job cards load
- [ ] Invoice creation works
- [ ] Feature flags accessible in Settings
- [ ] No console errors in browser
- [ ] Create a restore record in `docs/releases/`
