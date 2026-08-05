# Fixing the Preview Validation smoke test's 401

## What's broken and why (two separate causes, both confirmed)

`Preview Validation` → `Playwright Smoke (Preview)` failed on every PR. Two
distinct issues stacked on top of each other:

**1. Vercel's deployment-protection wall.** The job's own log showed 20/20
polling attempts getting `401`, then timing out — Vercel rejecting the
automated request before the app ever ran. Platform-level, not an app bug,
not fixable by code alone.

**2. A second, stray Vercel integration racing the real one.** Pulled the
raw GitHub Deployments API record for the exact deployment a failing run
targeted. The *same* deployment id posted two different `environment_url`
values 29 seconds apart:
```
10:28:24 → https://redlined1-iscza5a3h-d1-imports.vercel.app
10:28:53 → https://redlined1-iqhnr7l0x-redlined1-s-projects.vercel.app
```
`d1-imports` is a real, separate Vercel account — confirmed via
`vercel switch d1-imports` returning `scope_not_accessible` — most likely a
personal account this project lived under before being transferred to the
`redlined1-s-projects` team, whose GitHub integration was never disconnected.
It's still connected to `odeyt/redlined1` and still posts deployment
statuses for every PR, racing the real one. Whichever posts first when the
CI check happens to query is what gets used — sometimes the wrong one.

The `patrickedqvist/wait-for-vercel-preview` action has no way to filter by
scope (verified against its actual `v1.3.3` `action.yml` — no such input
exists), so no combination of its inputs could have fixed this.

## What's already done (code side, no secret involved)

- **`.github/workflows/preview-validation.yml`** — replaced the
  third-party "wait for preview" action entirely with a custom step that
  queries the GitHub Deployments API directly and explicitly filters for
  `environment_url` containing `redlined1-s-projects`, retrying until a
  matching one appears (up to the same ~5 minute budget as before). This
  neutralizes the race regardless of which project (`redlined1` or
  `d1-redline`) or which scope happens to post first.
- Also wired `x-vercel-protection-bypass` header support (via
  `secrets.VERCEL_AUTOMATION_BYPASS_SECRET`) into both that resolution step
  and the actual Playwright test-run step — needed for cause #1 above,
  independent of the race fix.
- **`playwright.config.ts`** — sends that same header on every request, but
  **only** when `TEST_MODE=preview` **and** the secret is actually present.
  Local and production runs are untouched.

Neither change embeds a secret value anywhere — both reference a GitHub
Actions secret name that doesn't exist yet.

**Not fixed by this:** `d1-imports` is still connected and still deploying
in the background on every push — the filter works around it, it doesn't
remove it. Disconnecting it at the source requires logging into whatever
separate Vercel account owns it, which wasn't accessible in this session
(confirmed: it doesn't appear in the team switcher for the account currently
logged in). Worth revisiting once that login is found.

## What only you can do (the actual secret)

Since the resolution step no longer targets one specific project, enable
the bypass on **both** projects in `redlined1-s-projects` to be safe:

1. Vercel dashboard → `redlined1` project → **Settings → Deployment
   Protection → Protection Bypass for Automation** → enable it, copy the
   generated value.
2. Repeat for the **`d1-redline`** project. If Vercel lets you reuse the
   same value across both, use the same one; otherwise generate separately
   and pick either — only one needs to land in GitHub (see below).
3. Add it to GitHub as a repo secret:
   ```bash
   gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo odeyt/redlined1
   ```
   (paste the value when prompted — goes straight into GitHub's encrypted
   secret store)
4. Re-run the `Preview Validation` check on any open PR (or push a new
   commit) to confirm it goes green.
