# Redlined1 — Incident Response Playbook

## Severity Levels

| Level | Description | Response Time |
|---|---|---|
| **SEV1** | Redlined1 unavailable — login broken, job cards/invoices inaccessible | Immediate (< 15 min) |
| **SEV2** | Major workflow degraded — estimates, payments, or inspections broken | < 1 hour |
| **SEV3** | Non-critical feature broken — AI advisor, reports, or smart intake broken | < 4 hours |
| **SEV4** | Cosmetic or minor issue — UI glitch, wrong label, non-blocking error | Next business day |

---

## SEV1 — Application Unavailable

**Symptoms:** Login fails, blank page, 500 on all routes, Supabase errors across all features.

**Who responds:** Lead engineer + D1 owner, immediately.

**First checks:**
1. Open `/api/health` — is it responding?
2. Check Vercel dashboard — is the latest deployment green?
3. Check Supabase dashboard → Status — is the DB up?
4. Check Sentry — what errors are firing?

**Rollback options (in order):**
1. **Feature flag disable** (< 1 min): if a new feature caused the crash, toggle it off in Settings → Feature Flags
2. **Vercel rollback** (< 2 min): promote last known-good deployment in Vercel dashboard
3. **Database migration reversal** (5–30 min): manually reverse the last SQL migration
4. **Supabase restore** (30–60+ min): restore from backup — last resort only

**Communication template:**
```
D1 Imports team — we are aware of an issue with Redlined1 affecting [feature].
Our team is investigating. We expect resolution by [time].
In the meantime, please [workaround if any].
We will update you when service is restored.
```

---

## SEV2 — Major Workflow Degraded

**Symptoms:** Estimates fail to save, invoice totals wrong, payments not recording, inspections not sending.

**Who responds:** Lead engineer, within 1 hour.

**First checks:**
1. Reproduce the issue with a test record
2. Check browser console for JavaScript errors
3. Check the relevant API route in Sentry
4. Check if the issue started after a recent deploy

**Rollback options:**
1. Disable the relevant feature flag (fastest)
2. Vercel rollback to pre-deploy version
3. Fix-forward with a hotfix if rollback is not possible

**Communication:** Notify D1 owner. Document timeline.

---

## SEV3 — Non-Critical Feature Broken

**Symptoms:** AI Copilot not responding, Repair Intelligence search empty, Smart Intake not saving, feature flag toggle failing.

**Who responds:** Lead engineer, within 4 hours during business hours.

**First checks:**
1. Check feature flag status — is it supposed to be enabled?
2. Check `/api/health` — is the relevant service configured?
3. Check Sentry for the specific error
4. Check if `ANTHROPIC_API_KEY` or other config is set in Vercel

**Rollback options:**
1. Disable the feature flag — users won't see the broken feature
2. Fix-forward with a targeted patch

---

## SEV4 — Cosmetic / Minor Issue

**Symptoms:** Badge count wrong, label misspelled, dark mode color off, non-blocking console warning.

**Who responds:** Any developer, next business day.

**Process:** Log in GitHub Issues → fix in `develop` → merge to `staging` → test → promote to production.

---

## Feature Flag Emergency Disable

For any feature breaking production:

1. Log in as owner
2. Go to **Settings → Feature Flags**
3. Find the flag for the broken feature
4. Toggle **OFF**
5. Confirm the feature is hidden for all users
6. Notify team the flag has been disabled

This is always the **fastest rollback** for any feature-gated functionality.

---

## Vercel Rollback Steps

1. [vercel.com](https://vercel.com) → `redlined1` project
2. Click **Deployments** tab
3. Find the last green deployment before the incident
4. Click **⋯ → Promote to Production**
5. Verify `/api/health` is healthy
6. Run core smoke tests

---

## Supabase Restore Escalation

Only escalate to a full restore if:
- Data is corrupted and cannot be recovered manually
- A migration destroyed critical rows (job_cards, invoices, customers)

**Steps:**
1. D1 owner must approve in writing
2. Document what data was created between backup time and now
3. Download backup from Supabase → Settings → Backups
4. Contact Supabase support for point-in-time restore (Pro plan)
5. After restore: re-enter any data created since the backup

---

## Post-Incident Note Template

Save as `docs/incidents/YYYY-MM-DD-description.md`:

```markdown
# Incident — YYYY-MM-DD — [Short Description]

**Severity:** SEV[1-4]
**Duration:** [start time] → [resolved time]
**Affected:** [which features/users]

## What happened
[Description]

## Root cause
[Technical cause]

## Actions taken
- [ ] Feature flag disabled
- [ ] Vercel rollback
- [ ] Migration reversed
- [ ] DB restored

## Timeline
- HH:MM — Issue detected
- HH:MM — Investigation started
- HH:MM — Root cause identified
- HH:MM — Fix deployed
- HH:MM — Confirmed resolved

## Prevention
[What process change prevents recurrence]
```
