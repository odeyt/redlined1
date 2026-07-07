# Disaster Recovery Plan — RedlineD1

**Version:** 1.0  
**Owner:** Platform Reliability  
**Last Updated:** 2026-07-07  
**Classification:** Internal — Owner Only

---

## Objectives

| Metric | Target |
|--------|--------|
| Recovery Point Objective (RPO) | < 15 minutes |
| Recovery Time Objective (RTO) | < 10 minutes |

---

## Scope

This plan covers complete recovery of the RedlineD1 production environment following:
- Database deletion or corruption
- Failed deployments
- Infrastructure outages (Supabase, Vercel)
- Storage loss
- Expired or leaked credentials
- Feature flag corruption

---

## Recovery Priority Order

| Priority | Component | RTO Target | Notes |
|----------|-----------|------------|-------|
| 1 | Database (Supabase) | < 5 min | Core — nothing works without it |
| 2 | Environment Variables | < 2 min | Must be set before app restarts |
| 3 | Storage (Supabase Storage) | < 10 min | File uploads, inspection images |
| 4 | Feature Flags | < 2 min | Safe defaults if unavailable |
| 5 | Application Deployment (Vercel) | < 5 min | Rollback to last good build |
| 6 | Knowledge Graph | < 15 min | Repair intelligence data |
| 7 | Repair Intelligence | < 15 min | AI pattern data |
| 8 | AI Config | < 5 min | API keys in Vercel env vars |

---

## Incident Severity Levels

| Level | Description | Response Time | Example |
|-------|-------------|---------------|---------|
| P0 — Critical | Production down, data loss risk | Immediate | Database deleted |
| P1 — High | Core feature unavailable | < 30 min | Auth broken, invoices failing |
| P2 — Medium | Degraded performance | < 2 hours | Slow queries, partial outage |
| P3 — Low | Minor issue, workaround exists | < 24 hours | Missing icon, UI glitch |

---

## Decision Tree

```
Production Issue Detected
        │
        ▼
Is the app loading at all?
├── NO → Check Vercel deployment status → Rollback if needed
└── YES
        │
        ▼
Is login working?
├── NO → Check Supabase Auth → Check NEXT_PUBLIC_SUPABASE_URL / ANON_KEY
└── YES
        │
        ▼
Is data missing or corrupted?
├── YES → Check Supabase backups → Point-in-time restore
└── NO
        │
        ▼
Is the issue isolated to one feature?
├── YES → Disable feature flag → Deploy hotfix
└── NO → Escalate to full DR procedure
```

---

## Key Contacts

| Role | Responsibility |
|------|---------------|
| Owner | Authorize recovery actions |
| Platform Lead | Execute technical recovery |
| Supabase Support | Database-level issues |
| Vercel Support | Deployment-level issues |

---

## External Service Status Pages

- Supabase: https://status.supabase.com
- Vercel: https://www.vercel-status.com
- GitHub: https://www.githubstatus.com

---

## Related Documents

- [BACKUP_STRATEGY.md](BACKUP_STRATEGY.md)
- [RESTORE_PROCEDURE.md](RESTORE_PROCEDURE.md)
- [INCIDENT_RUNBOOK.md](INCIDENT_RUNBOOK.md)
- [RISK_MATRIX.md](RISK_MATRIX.md)
- [RECOVERY_TEST_PLAN.md](RECOVERY_TEST_PLAN.md)
