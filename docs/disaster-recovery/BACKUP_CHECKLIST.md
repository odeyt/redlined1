# Backup Verification Checklists — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

---

## Daily Checklist

*Verify automatically via /api/health or Disaster Recovery dashboard.*

- [ ] `/api/health` returns `status: healthy`
- [ ] Supabase check: ✓ OK
- [ ] Feature Flags check: ✓ OK
- [ ] No new errors in observability logs (System Health → Recent Events)
- [ ] Last deployment is stable (no error spike after last push)

**Time required:** 2 minutes

---

## Weekly Checklist

- [ ] Review Supabase dashboard for last backup timestamp
- [ ] Confirm Supabase Pro plan is active (required for PITR)
- [ ] Check Vercel deployment history — last 5 deployments successful
- [ ] Review observability error logs for recurring errors
- [ ] Verify git `main` branch is current: `git log --oneline -5`
- [ ] Check that all Vercel env vars are present (Settings → Environment Variables)
- [ ] Review feature flags — confirm no flags accidentally enabled

**Time required:** 10 minutes

---

## Monthly Checklist

- [ ] Review and update offline env var backup (password manager)
- [ ] Confirm migration registry is current (docs/migrations/MIGRATION_REGISTRY.md)
- [ ] Create release snapshot for any production releases this month
- [ ] Verify Supabase billing is current (no plan downgrade)
- [ ] Check Vercel billing is current
- [ ] Check domain expiration in Namecheap (renew if < 60 days)
- [ ] SSL certificate valid (auto-renewed by Vercel — just verify)
- [ ] Test: simulate reading from backup via staging environment
- [ ] Review RISK_MATRIX.md for any new risks to add
- [ ] Update DR documentation if infrastructure changed

**Time required:** 30 minutes

---

## Quarterly Checklist

- [ ] Run RECOVERY_TEST_PLAN.md Test 1 — Database Restore (staging)
- [ ] Run RECOVERY_TEST_PLAN.md Test 2 — Vercel Rollback (staging)
- [ ] Run RECOVERY_TEST_PLAN.md Test 3 — Feature Flag Reset (staging)
- [ ] Run RECOVERY_TEST_PLAN.md Test 5 — Full Rebuild Tabletop
- [ ] Update RECOVERY_TEST_PLAN.md test schedule with results
- [ ] Review and update BUSINESS_CONTINUITY_PLAN.md
- [ ] Verify paper fallback forms are stocked at front desk
- [ ] Review incident log for any patterns to address
- [ ] Update Recovery Readiness Score in DR dashboard
- [ ] Send quarterly DR readiness summary to owner

**Time required:** 2 hours

---

## Checklist Log

Record each completed review:

| Date | Type | Completed By | Issues Found | Actions Taken |
|------|------|-------------|--------------|---------------|
| — | — | — | — | — |
