# Recovery Test Plan — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

---

## Purpose

Verify that disaster recovery procedures work before an actual incident.
Tests should be run on STAGING only — never on production.

**Target frequency:** Quarterly

---

## Test 1 — Database Restore Validation

**Environment:** Staging  
**Duration:** 15 minutes  
**Risk:** Low (staging only)

```
Steps:
1. Note current record counts in staging (customers, job_cards)
2. In Supabase staging dashboard → Backups → select any snapshot
3. Initiate restore
4. After restore, verify record counts match expected
5. Run: GET staging.redlined1.com/api/health → supabase: OK
6. Log: restore time, any issues

Pass criteria:
- Restore completes without error
- Record counts match expected
- /api/health returns supabase: true
```

---

## Test 2 — Vercel Rollback Simulation

**Environment:** Staging  
**Duration:** 5 minutes  
**Risk:** None

```
Steps:
1. Deploy a test change to staging branch
2. Verify the change is visible on staging.redlined1.com
3. Rollback to previous deployment via Vercel dashboard
4. Verify the change is no longer visible
5. Re-promote the new deployment

Pass criteria:
- Rollback completes in < 2 minutes
- Site functions correctly after rollback
```

---

## Test 3 — Feature Flag Reset

**Environment:** Staging  
**Duration:** 5 minutes  
**Risk:** Low

```
Steps:
1. Enable a feature flag in staging via Settings → Feature Flags
2. In Supabase SQL Editor (staging), run: DELETE FROM feature_flags;
3. Re-run migration_feature_flags.sql
4. Verify all flags are OFF
5. Verify /api/feature-flags returns valid response

Pass criteria:
- Flags reset to defaults without app errors
- Feature gates correctly deny access when flags are off
```

---

## Test 4 — Environment Variable Recovery

**Environment:** Staging  
**Duration:** 10 minutes  
**Risk:** Low

```
Steps:
1. In Vercel staging config, temporarily remove RESEND_API_KEY
2. Verify email-related features degrade gracefully (no crash)
3. Verify /api/health shows email: missing
4. Re-add the key
5. Redeploy
6. Verify email: configured in /api/health

Pass criteria:
- App does not crash when key is missing
- Recovery by re-adding key works within 10 minutes
```

---

## Test 5 — Full Rebuild Simulation (Tabletop)

**Environment:** Documentation review  
**Duration:** 30 minutes  
**Risk:** None

```
Steps (no actual changes):
1. Walk through RESTORE_PROCEDURE.md Procedure 5 as a team
2. Identify any steps that are unclear or missing information
3. Verify all credentials are accessible from offline backup
4. Estimate actual time for each step
5. Update documentation with findings

Pass criteria:
- Full rebuild path is clear with no missing steps
- All credentials are accessible
- Estimated recovery time < 30 minutes
```

---

## Test Schedule

| Test | Frequency | Last Run | Next Due | Outcome |
|------|-----------|----------|----------|---------|
| Database Restore | Quarterly | Never | Q3 2026 | Pending |
| Vercel Rollback | Quarterly | Never | Q3 2026 | Pending |
| Feature Flag Reset | Quarterly | Never | Q3 2026 | Pending |
| Env Var Recovery | Quarterly | Never | Q3 2026 | Pending |
| Full Rebuild Tabletop | Annually | Never | Q4 2026 | Pending |

---

## Test Log

Record each test run:

```
Date:
Test:
Environment:
Outcome: PASS / FAIL / PARTIAL
Duration:
Issues Found:
Documentation Updated:
```
