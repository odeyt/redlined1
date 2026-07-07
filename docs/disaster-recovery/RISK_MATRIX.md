# Risk Matrix — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

Likelihood: Low / Medium / High  
Impact: Low / Medium / High / Critical

---

| Risk | Likelihood | Impact | Recovery Method | Est. Downtime | Owner |
|------|-----------|--------|-----------------|---------------|-------|
| Bad deployment (code bug) | High | High | Vercel instant rollback | < 2 min | Platform |
| Expired API key | Medium | Medium | Re-add key in Vercel dashboard | < 10 min | Owner |
| Supabase outage | Low | Critical | Wait for Supabase recovery | External | Supabase |
| Vercel outage | Low | Critical | Deploy to alternate host | 30–60 min | Platform |
| Database row deletion (accidental) | Low | Critical | Supabase PITR | 5–10 min | Platform |
| Database table dropped | Very Low | Critical | Supabase PITR | 5–10 min | Platform |
| Broken migration | Medium | High | PITR or migration rollback | 5–15 min | Platform |
| Feature flag corruption | Low | Medium | Re-seed from SQL | < 5 min | Platform |
| Storage bucket deleted | Very Low | Medium | Recreate + restore from backup | 15–30 min | Platform |
| Storage files lost | Very Low | Medium | Manual re-upload (no auto backup) | Hours | Owner |
| GitHub repository deleted | Very Low | Critical | Restore from local clone | 15–30 min | Platform |
| Leaked service role key | Low | Critical | Rotate key in Supabase + Vercel | 10–20 min | Owner |
| DNS misconfiguration | Low | Critical | Revert DNS record in Namecheap | 5–30 min | Owner |
| SSL certificate expired | Very Low | High | Auto-renewed by Vercel | 0 (auto) | Vercel |
| DDoS / traffic spike | Very Low | Medium | Vercel edge handles most cases | Minimal | Vercel |
| Data corruption (app bug) | Low | High | PITR to pre-bug timestamp | 5–10 min | Platform |
| Environment variable deleted | Low | High | Re-enter from offline backup | 5–10 min | Owner |
| CREEM webhook failure | Medium | Medium | Manual payment sync | Minimal | Platform |
| Email delivery failure | Medium | Low | Resend fallback / manual | Minimal | Platform |

---

## Risk Scoring

**Composite Risk = Likelihood × Impact**

| Score | Label |
|-------|-------|
| Critical × High | 🔴 P0 — Immediate action |
| High × High | 🟠 P1 — Respond within 30 min |
| Medium × Medium | 🟡 P2 — Respond within 2 hours |
| Low × Low | 🟢 P3 — Schedule fix |

---

## Top 3 Risks by Priority

1. **🔴 Supabase outage** — External, uncontrollable. Mitigate with business continuity plan (paper fallback).
2. **🔴 Database deletion** — PITR is the safety net. Ensure Supabase Pro plan is maintained.
3. **🟠 Bad deployment** — Vercel rollback is fast. Mitigated by `npm run verify` pre-push and staging environment.

---

## Mitigation Investments

| Mitigation | Status | Impact |
|-----------|--------|--------|
| Supabase Pro (PITR enabled) | ✓ Required | Reduces DB loss RPO to < 15 min |
| Vercel deployment history | ✓ Built-in | Enables instant rollback |
| Feature flag system | ✓ Implemented | Disable features without deploy |
| Staging environment | Partial | Prevents bad deploys reaching prod |
| Health endpoint | ✓ Implemented | Early detection of failures |
| Observability logs | ✓ Implemented | Post-incident analysis |
| Offline env var backup | Manual | Owner responsibility |
| Manual paper fallback | Recommended | Business continuity during outage |
