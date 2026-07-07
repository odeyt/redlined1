# Release Snapshot Template

Copy this template for each production release.
Save as: `docs/releases/RELEASE_v<version>_<date>.md`

---

# Release vX.X.X — YYYY-MM-DD

## Release Summary

| Field | Value |
|-------|-------|
| Version | vX.X.X |
| Release Date | YYYY-MM-DD HH:MM UTC |
| Git Commit | `abc1234` |
| Vercel Deployment ID | `dpl_xxxxx` |
| Environment | Production |
| Released By | (name) |

---

## Migration Version

| # | Migration | Applied This Release | Status |
|---|-----------|---------------------|--------|
| 1 | migration_billing.sql | No | Previously applied |
| 2 | migration_feature_flags.sql | No | Previously applied |
| 3 | migration_observability_logs.sql | No | Previously applied |
| N | migration_new_feature.sql | YES | Applied YYYY-MM-DD |

---

## Feature Flag Snapshot

State of all feature flags at release time:

| Flag Key | Enabled |
|----------|---------|
| ai_advisor_enabled | false |
| sms_notifications_enabled | false |
| multi_location_enabled | false |
| advanced_reporting_enabled | false |
| repair_intelligence_enabled | false |
| custom_branding_enabled | false |
| api_access_enabled | false |
| bulk_import_enabled | false |
| advanced_search_enabled | false |
| beta_features_enabled | false |

*Copy actual values from GET /api/feature-flags before release.*

---

## Changes in This Release

### New Features
- 

### Bug Fixes
- 

### Infrastructure
- 

### No Changes To
- Business workflows (confirmed)
- Database schema (if no migration)
- Existing API contracts

---

## Rollback Plan

| Rollback Method | Estimated Time |
|----------------|----------------|
| Vercel deployment rollback | < 2 minutes |
| Target rollback deployment | `dpl_previous_id` |
| Migration rollback required | No / Yes — see MIGRATION_REGISTRY.md |
| Data at risk | None / Describe |

**Rollback command (if migration was applied):**
```sql
-- Paste rollback SQL from MIGRATION_REGISTRY.md if applicable
```

---

## Post-Release Verification

- [ ] `/api/health` returns `status: healthy`
- [ ] Login works
- [ ] Job cards load
- [ ] Invoices load
- [ ] Feature flags accessible
- [ ] No error spike in observability logs (30 min post-deploy)
- [ ] Playwright smoke tests pass: `npm run test:smoke`

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Owner | | | ☐ Approved |
| Platform Lead | | | ☐ Verified |
