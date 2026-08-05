# Fixing the Preview Validation smoke test's 401

## What's broken and why

`Preview Validation` → `Playwright Smoke (Preview)` fails on every PR. The
job's own log shows the cause plainly: it polled the preview URL 20 times
over 5 minutes and got `401` every single time, then timed out. That's
Vercel's own deployment-protection wall rejecting the automated request
before the app ever runs — not an app bug, and not something a code fix on
this repo's side alone can resolve, since the wall sits in front of the
deployment at the platform level.

Confirmed via the actual failing log the target was
`https://d1-redline-*-redlined1-s-projects.vercel.app` — i.e. this needs to
be fixed on the **`d1-redline`** Vercel project specifically (check `redlined1`
too if its own previews are ever protected the same way).

## What's already done (code side, no secret involved)

- `.github/workflows/preview-validation.yml` — bumped the
  `wait-for-vercel-preview` action from `v1.3.1` to `v1.3.3` (the version
  that added `vercel_protection_bypass_header` support) and wired it to read
  `secrets.VERCEL_AUTOMATION_BYPASS_SECRET`. Also passes the same secret
  through to the Playwright test-run step, since the wait-step's bypass only
  covers the readiness check — Playwright's own browser requests hit the
  same wall independently.
- `playwright.config.ts` — sends `x-vercel-protection-bypass` as a header on
  every request, but **only** when `TEST_MODE=preview` **and** the secret
  env var is actually present. Local and production runs are untouched.

Neither change embeds a secret value anywhere — both just reference a
GitHub Actions secret name that doesn't exist yet.

## What only you can do (the actual secret)

1. Vercel dashboard → `d1-redline` project → **Settings → Deployment
   Protection → Protection Bypass for Automation** → enable it. Vercel
   generates the secret value itself; copy it.
2. Add it to GitHub as a repo secret:
   ```bash
   gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo odeyt/redlined1
   ```
   (paste the value when prompted — this goes straight into GitHub's
   encrypted secret store, the same way `VERCEL_TOKEN` already does)
3. Re-run the `Preview Validation` check on any open PR (or push a new
   commit) to confirm it goes green.

If `redlined1`'s own previews turn out to need the same treatment
independently, repeat step 1 for that project — Vercel's Protection Bypass
secret is per-project, but the same GitHub secret name can be reused as long
as both projects were configured with the same bypass value.
