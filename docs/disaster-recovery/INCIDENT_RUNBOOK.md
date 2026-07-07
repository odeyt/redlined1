# Incident Runbook — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

Each section covers a specific failure scenario with step-by-step recovery.

---

## Incident 1 — Database Deleted

**Symptoms:** App loads but all data missing; login fails; Supabase dashboard shows empty project.

**Severity:** P0 — Critical

**Recovery time:** 5–10 minutes

```
IMMEDIATE:
1. Do NOT create new tables — this could interfere with PITR
2. Go to Supabase Dashboard → Backups → Point in Time Recovery
3. Select timestamp just before deletion
4. Confirm restore
5. Wait for completion (2–3 min)
6. Verify: GET /api/health → supabase: OK
7. Verify: Login and check customer data

IF PITR UNAVAILABLE:
1. Restore from most recent manual backup
2. Re-run any migrations applied after backup date
3. Notify users of data loss window (time between backup and deletion)
```

---

## Incident 2 — Bad Deployment (App Broken)

**Symptoms:** 500 errors, blank screen, build error after push.

**Severity:** P1 — High

**Recovery time:** 2 minutes

```
IMMEDIATE:
1. Go to Vercel → Deployments
2. Find last successful deployment (green)
3. Click "..." → "Promote to Production"
4. Verify site loads at redlined1.com
5. Verify login works

THEN:
1. Investigate the broken commit in git
2. Fix locally, test with: npm run verify
3. Push hotfix to trigger new deployment
```

---

## Incident 3 — Broken Migration

**Symptoms:** App errors after migration run; certain features 500; database schema mismatch.

**Severity:** P1 — High

**Recovery time:** 5–15 minutes

```
IMMEDIATE:
1. Identify which migration caused the issue
2. Check if migration has a documented rollback in MIGRATION_REGISTRY.md

IF ROLLBACK SQL EXISTS:
1. Run rollback SQL in Supabase SQL Editor
2. Remove or revert the migration file in git
3. Deploy

IF NO ROLLBACK:
1. Use PITR to restore to just before migration was applied
2. Note: any data written AFTER migration will be lost
3. Fix migration SQL, test on staging first
4. Re-apply corrected migration

PREVENTION: Always test migrations on staging before production.
```

---

## Incident 4 — Supabase Outage

**Symptoms:** App loads but all data operations fail; /api/health shows supabase: FAIL.

**Severity:** P1 — High (external dependency)

**Recovery time:** Dependent on Supabase

```
IMMEDIATE:
1. Check: https://status.supabase.com
2. If confirmed outage: post status update for users
3. Do NOT make infrastructure changes during outage
4. Wait for Supabase resolution

MITIGATION:
- The app will show error states gracefully (fail-open)
- Feature flags default to OFF (safe)
- Health endpoint will report degraded

RECOVERY:
1. Once Supabase status is green, verify: GET /api/health
2. Check recent logs for any data inconsistency
3. No further action typically required
```

---

## Incident 5 — Vercel Outage

**Symptoms:** redlined1.com unreachable; DNS resolves but no response.

**Severity:** P1 — High (external dependency)

**Recovery time:** Dependent on Vercel

```
IMMEDIATE:
1. Check: https://www.vercel-status.com
2. If confirmed outage: communicate to users
3. Wait for Vercel resolution

FALLBACK (if extended outage > 2 hours):
1. Deploy to alternative host (Netlify, Railway, Render)
2. Update DNS CNAME to point to new host
3. Re-enter environment variables on new host
4. DNS propagation: 5–30 minutes
```

---

## Incident 6 — Storage Loss

**Symptoms:** Inspection photos, uploaded documents return 404 or missing.

**Severity:** P2 — Medium

**Recovery time:** 10–30 minutes (if backup available)

```
1. Check Supabase Storage dashboard for bucket status
2. If bucket exists but files missing: check Supabase support
3. If bucket deleted:
   a. Recreate bucket with same name and same public/private settings
   b. Restore files from external backup (if exported previously)
   c. If no backup: files are permanently lost
4. Verify affected records in database still reference correct paths
5. Notify affected shop users of lost files
```

---

## Incident 7 — Expired API Key

**Symptoms:** Payment processing fails; email not sending; specific feature 500s.

**Severity:** P2 — Medium

**Recovery time:** 5–10 minutes

```
1. Identify which key expired:
   - Payment fails → CREEM_API_KEY
   - Email fails → RESEND_API_KEY
   - AI fails → ANTHROPIC_API_KEY
   - SMS fails → TWILIO_*

2. Generate new key from respective provider dashboard

3. Update in Vercel:
   Settings → Environment Variables → Edit → Update value

4. Trigger a new Vercel deployment (or redeploy current)

5. Verify: GET /api/health → affected service shows configured
```

---

## Incident 8 — Feature Flag Corruption

**Symptoms:** Features randomly enabled/disabled; flag panel shows errors; settings lost.

**Severity:** P2 — Medium

**Recovery time:** < 5 minutes

```
OPTION A — PITR (if data matters):
1. Restore database to before corruption event
2. Verify flags in Settings

OPTION B — Re-seed (if defaults are acceptable):
1. Run migration_feature_flags.sql in Supabase SQL Editor
2. This resets all flags to OFF (safe default)
3. Manually re-enable flags as needed from Settings → Feature Flags
4. Verify: GET /api/feature-flags → flags object returned

NOTE: Option B is faster and safer. All flags default OFF = no features accidentally enabled.
```

---

## Incident Log Template

When an incident occurs, record:

```
DATE: 
TIME DETECTED:
TIME RESOLVED:
SEVERITY:
DESCRIPTION:
ROOT CAUSE:
ACTIONS TAKEN:
DATA LOSS:
USERS AFFECTED:
PREVENTION:
```
