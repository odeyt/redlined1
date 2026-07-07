# Backup Strategy — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

---

## Overview

RedlineD1 relies on Supabase for all persistent state. Supabase Pro provides automatic
Point-in-Time Recovery (PITR) with continuous WAL archiving. Git + Vercel provide
deployment-level backups. This document describes the full backup architecture.

---

## Backup Architecture

### 1. Supabase Database

| Property | Value |
|----------|-------|
| Provider | Supabase (PostgreSQL 15) |
| Method | Automatic daily snapshots + PITR (Pro plan) |
| Frequency | Continuous WAL archiving; snapshot every 24h |
| Retention | 7 days (Pro) / 30 days (Team) |
| Recovery Priority | 1 — highest |
| Estimated Restore Time | 2–5 minutes (PITR) |
| RPO | < 15 minutes (WAL) |
| Verification | `/api/health` → supabase check |

**Access:** Supabase Dashboard → Project → Backups

**PITR window:** Up to 7 days back (Pro plan). Upgrade to Team for 30 days.

---

### 2. Supabase Storage

| Property | Value |
|----------|-------|
| Provider | Supabase Storage (S3-compatible) |
| Contents | Inspection photos, uploaded documents |
| Method | S3 replication (automatic in Supabase) |
| Frequency | Real-time replication |
| Retention | Until manually deleted |
| Estimated Restore Time | 5–15 minutes |
| Manual backup | Export via Supabase CLI or Storage API |

**Note:** Storage objects are NOT included in database PITR. If storage is lost,
files must be re-uploaded. Consider periodic export to external S3.

---

### 3. Feature Flags

| Property | Value |
|----------|-------|
| Location | `feature_flags` table in Supabase |
| Recovery | Covered by database PITR |
| Manual backup | `/api/feature-flags` → JSON export |
| Safe default | All flags OFF (fail-safe) |
| Estimated Restore Time | < 1 minute (re-seed from migration SQL) |

**Fallback:** If `feature_flags` table is lost, run `supabase/migration_feature_flags.sql`
to re-create with all defaults OFF. System remains functional.

---

### 4. Knowledge Graph / Repair Intelligence

| Property | Value |
|----------|-------|
| Location | Supabase tables (repair_cases, graph data) |
| Recovery | Covered by database PITR |
| Rebuild time | 1–7 days if full rebuild from job history needed |
| Estimated Restore Time | 15 min (PITR) — or 1-7 days (rebuild) |

---

### 5. Migration History

| Property | Value |
|----------|-------|
| Location | Git repo (`supabase/`) + Supabase `schema_migrations` table |
| Frequency | Committed on every migration run |
| Retention | Permanent (git history) |
| Recovery | Re-run migrations in order from git |

All migration SQL files are stored in `supabase/migration_*.sql`.
The applied order is documented in [MIGRATION_REGISTRY.md](../migrations/MIGRATION_REGISTRY.md).

---

### 6. Environment Variables

| Property | Value |
|----------|-------|
| Location | Vercel dashboard (encrypted at rest) |
| Backup method | Owner maintains offline copy in password manager |
| Recovery | Re-enter into Vercel dashboard manually |
| Estimated Restore Time | 5–10 minutes |

**Critical variables to preserve:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CREEM_API_KEY`
- `RESEND_API_KEY`
- `NEXT_PUBLIC_APP_URL`

---

### 7. Vercel Deployments

| Property | Value |
|----------|-------|
| Provider | Vercel |
| Retention | Last 100 deployments |
| Rollback | Instant (< 60 seconds) via Vercel dashboard |
| Git backup | Every deployment tied to a git commit |

---

### 8. Git Repository

| Property | Value |
|----------|-------|
| Primary | GitHub (odeyt/redlined1) |
| Backup | Local developer machines |
| Frequency | Continuous (every push) |
| Retention | Permanent |
| Estimated Restore Time | < 5 minutes (re-clone + redeploy) |

---

### 9. Release Snapshots

| Property | Value |
|----------|-------|
| Location | `docs/releases/` |
| Contents | Version, commit, migration version, flag snapshot |
| Frequency | Created on every production release |
| Template | [docs/releases/RELEASE_TEMPLATE.md](../releases/RELEASE_TEMPLATE.md) |

---

## Backup Health Summary

| Component | Automated | Manual Required | RPO |
|-----------|-----------|-----------------|-----|
| Database | ✓ Supabase PITR | No | < 15 min |
| Storage | ✓ S3 replication | Periodic export | Real-time |
| Feature Flags | ✓ Via DB backup | Re-seed from SQL | < 15 min |
| Migrations | ✓ Git | No | On commit |
| Env Vars | ✗ | Owner backup | Manual |
| Deployments | ✓ Vercel history | No | On deploy |
| Git Repo | ✓ GitHub | No | On push |
| Release Snapshots | ✗ | Manual per release | Per release |
