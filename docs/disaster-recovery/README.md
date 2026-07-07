# Disaster Recovery — RedlineD1

**How to recover RedlineD1 from scratch.**

---

## Estimated Recovery Timeline

| Scenario | Time to Recovery |
|----------|-----------------|
| Bad deployment | < 2 minutes (Vercel rollback) |
| Broken feature | < 5 minutes (feature flag disable) |
| Database corruption | 5–10 minutes (Supabase PITR) |
| Env var loss | 5–10 minutes (re-enter from backup) |
| Full infrastructure loss | 20–30 minutes (git + Supabase + Vercel) |
| Supabase/Vercel outage | External — paper fallback while waiting |

**RPO Target:** < 15 minutes  
**RTO Target:** < 10 minutes

---

## Quick Recovery Reference

### App is down → Vercel broken deployment
→ See [VERCEL_ROLLBACK_GUIDE.md](VERCEL_ROLLBACK_GUIDE.md)

### Data is missing or corrupted
→ See [SUPABASE_BACKUP_GUIDE.md](SUPABASE_BACKUP_GUIDE.md)

### Feature is broken → disable without deploying
→ Settings → Feature Flags → disable the flag

### Full recovery from scratch
→ See [RESTORE_PROCEDURE.md](RESTORE_PROCEDURE.md) — Procedure 5

### Don't know what happened
→ See [INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md) — Decision tree

---

## Document Index

| Document | Purpose |
|----------|---------|
| [DISASTER_RECOVERY_PLAN.md](DISASTER_RECOVERY_PLAN.md) | Master DR plan, objectives, priority order |
| [BACKUP_STRATEGY.md](BACKUP_STRATEGY.md) | What is backed up, how, and how often |
| [RESTORE_PROCEDURE.md](RESTORE_PROCEDURE.md) | Step-by-step restore procedures |
| [INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md) | Per-scenario recovery playbooks |
| [SUPABASE_BACKUP_GUIDE.md](SUPABASE_BACKUP_GUIDE.md) | Database backup and PITR details |
| [VERCEL_ROLLBACK_GUIDE.md](VERCEL_ROLLBACK_GUIDE.md) | How to roll back a deployment |
| [RECOVERY_TEST_PLAN.md](RECOVERY_TEST_PLAN.md) | Quarterly DR test procedures |
| [BUSINESS_CONTINUITY_PLAN.md](BUSINESS_CONTINUITY_PLAN.md) | Manual fallback during outages |
| [RISK_MATRIX.md](RISK_MATRIX.md) | Risk assessment and mitigation |

---

## Recovery Readiness Checklist

Verify monthly:

- [ ] Supabase Pro plan active (enables PITR)
- [ ] Last backup timestamp visible in Supabase dashboard
- [ ] Vercel deployment history accessible
- [ ] Offline env var backup is current
- [ ] Git repository is current on GitHub
- [ ] /api/health returns `status: healthy`
- [ ] Owner can log in to Supabase, Vercel, GitHub, Namecheap

---

## Owner Manual Steps Required

These cannot be automated and require owner action:

1. **Keep Supabase Pro plan active** — PITR depends on it
2. **Maintain offline env var backup** — password manager or encrypted doc
3. **Run quarterly DR tests on staging** — see RECOVERY_TEST_PLAN.md
4. **Create release snapshot on each production deploy** — see docs/releases/
