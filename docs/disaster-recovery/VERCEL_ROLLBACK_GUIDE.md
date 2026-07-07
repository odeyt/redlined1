# Vercel Rollback Guide — RedlineD1

**Version:** 1.0  
**Last Updated:** 2026-07-07

---

## When to Roll Back

Roll back a Vercel deployment when:
- Production is returning 500 errors after a new push
- The app is blank or broken after a deploy
- A feature is critically broken and needs immediate fix
- Build succeeded but runtime errors appeared

**Important:** Rollback only reverts code. It does NOT revert the database.
If a migration was applied alongside the deployment, rolling back code while the
database has the new schema can cause additional errors — see INCIDENT_RUNBOOK.md.

---

## Instant Rollback (< 2 minutes)

```
1. Go to: https://vercel.com/odeyt/redlined1/deployments

2. Find the last known-good deployment:
   - Look for the green "Ready" status
   - Check the deployment time (before the incident started)
   - Note the git commit hash for reference

3. Click "..." (three dots) next to that deployment

4. Click "Promote to Production"

5. Confirm the promotion

6. Vercel switches production instantly (< 30 seconds)

7. Verify: https://redlined1.com loads correctly

8. Test: Login → Dashboard → Job Cards
```

---

## Identifying the Broken Commit

After rolling back, identify what broke:

```bash
# View recent commits
git log --oneline -10

# See what changed in the bad commit
git show <bad-commit-hash>

# Run locally to reproduce
npm run verify
```

---

## Re-Deploying a Fixed Version

After fixing locally:

```bash
# Test everything
npm run lint
npm run typecheck
npm run build

# Push to trigger Vercel deployment
git push origin main

# Monitor Vercel deployment log for errors
```

---

## Vercel Deployment History

Vercel retains the last 100 deployments. Each deployment record includes:
- Git commit hash and message
- Build logs
- Function logs
- Deployment timestamp
- Status (Ready / Error / Building)

**Access:** https://vercel.com/odeyt/redlined1/deployments

---

## Preview Deployments (Staging)

Every push to the `staging` branch creates a preview deployment at:
`https://staging.redlined1.com`

Use preview deployments to verify changes before promoting to production.

---

## Emergency: Complete Vercel Project Reset

If the Vercel project itself is deleted or inaccessible:

```
1. Create new Vercel project at vercel.com
2. Connect to GitHub: odeyt/redlined1
3. Set all environment variables (from password manager backup)
4. Deploy from main branch
5. Update domain DNS to point to new Vercel URL
6. Verify /api/health passes all checks
```

DNS propagation: 5–30 minutes depending on TTL.
