# Redlined1 — Release Checklist

Use this checklist for every release. Check each item before proceeding to the next stage.

---

## Before Merge to Staging

- [ ] Feature flag created for new functionality (if applicable)
- [ ] Feature is gated behind the flag and **disabled by default**
- [ ] `npm run build` passes with no errors
- [ ] `npm run typecheck` passes with no TypeScript errors
- [ ] `npm run lint` passes (or known pre-existing issues documented)
- [ ] No secrets or API keys committed to the repo
- [ ] Database migration reviewed line-by-line
- [ ] Migration uses `IF NOT EXISTS` / `OR REPLACE` where possible
- [ ] Rollback plan documented (see `ROLLBACK_GUIDE.md`)
- [ ] Migration tested on staging Supabase
- [ ] App tested on staging URL (`staging.redlined1.com`)
- [ ] D1 beta shop tested if feature affects any shop workflow

---

## Before Merge to Production (`staging → main`)

- [ ] All "Before Merge to Staging" items complete
- [ ] Full smoke test passed on staging (see `SMOKE_TEST_PLAN.md`)
- [ ] D1 Imports owner approved the release
- [ ] Supabase production backup completed and saved
- [ ] All pending migrations queued and reviewed
- [ ] Vercel production environment variables verified
- [ ] Feature flags confirmed **disabled by default** in production
- [ ] Creem webhook URL verified (production endpoint registered)
- [ ] Release notes prepared (what changed, known issues)

---

## After Production Deploy

- [ ] Login flow works for owner account
- [ ] Switch shop works correctly
- [ ] Job card creation works (Quick Job Card + Smart Job Card)
- [ ] Estimate creation works
- [ ] Repair order creation works
- [ ] Invoice creation works
- [ ] Payment recording works
- [ ] Repair Intelligence panel loads
- [ ] Feature Flags panel visible to owner in Settings
- [ ] Triage flow works (category → questions → summary)
- [ ] Digital inspection creation works
- [ ] No JavaScript errors in browser console
- [ ] Vercel deployment logs show no runtime errors
- [ ] Supabase logs show no unexpected errors
- [ ] Error rates normal (check Vercel function logs)

---

## Hotfix Checklist

For urgent production fixes only:

- [ ] Issue is confirmed production-breaking
- [ ] Hotfix branch created from `main`: `hotfix/description`
- [ ] Fix scoped to minimum change needed
- [ ] Tested locally
- [ ] Deployed to staging first (even briefly)
- [ ] Production backup taken
- [ ] Merged to `main` → Vercel auto-deploy
- [ ] Merged back to `develop` and `staging` branches
- [ ] Post-incident note written (see `ROLLBACK_GUIDE.md` template)
