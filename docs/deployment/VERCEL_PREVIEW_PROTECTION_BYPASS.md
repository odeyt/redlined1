# Fixing the Preview Validation smoke test's 401

## Update 2026-08-30 (later the same day): the static secret approach is dead — switched to OIDC Trusted Sources

Regenerating `VERCEL_AUTOMATION_BYPASS_SECRET` (per the update below) did
**not** fix it — same failure, now a 307 instead of a 302. Checked the
`redlined1` project's Deployment Protection settings directly in the Vercel
dashboard (Settings → Deployment Protection): **the "Protection Bypass for
Automation" section is gone.** It's not disabled or misconfigured — it
doesn't appear on the page at all anymore. Only three sections remain:
Vercel Authentication, Password Protection, and **Trusted Sources**.

Trusted Sources is Vercel's current mechanism for exactly this use case
(confirmed via Vercel's own docs,
https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/trusted-sources)
— it replaces a shared static secret with a short-lived **OIDC token**
that GitHub Actions mints per run and Vercel verifies against its issuer.
No secret to rotate, nothing to leak from a log.

**What changed in code** (`.github/workflows/preview-validation.yml`,
`playwright.config.ts`):
- The job now requests `permissions: id-token: write` (plus `contents:
  read` and `deployments: read`, since setting any `permissions` key
  switches GitHub from its broad default to exactly that list).
- A new step (`Get Vercel Trusted-Source OIDC token`) calls
  `core.getIDToken()` via `actions/github-script@v7` to mint a token with
  the default audience `https://github.com/<org>`.
- The verify step and the actual Playwright run now send that token as
  `x-vercel-trusted-oidc-idp-token` instead of
  `x-vercel-protection-bypass`.
- `VERCEL_AUTOMATION_BYPASS_SECRET` is no longer read anywhere in this
  repo — it's safe to delete from GitHub secrets whenever convenient
  (kept for now in case of rollback).

**What only you can do, still — the dashboard side of Trusted Sources:**
1. Vercel dashboard → `redlined1` project → **Settings → Deployment
   Protection → Trusted Sources → External Services → Add → GitHub
   Actions**.
2. Pick the GitHub account/org this repo lives under. Optionally narrow to
   this repository (and a branch, if you want to scope it further).
3. Under **Applies to environments**, check **Preview** (this workflow only
   ever needs to reach Preview deployments).
4. Leave the audience as default — `getIDToken()` with no argument sends
   `https://github.com/<org>`, which is exactly what the guided form
   configures automatically.
5. Save, then re-run `Preview Validation` on any open PR (or push a new
   commit) — the new pre-check step confirms it in seconds either way.

## What's broken and why (two separate causes, both confirmed) — historical, applied to the now-removed static-secret approach

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

## Update 2026-08-30: confirmed the secret itself is the remaining problem

Checked PR #14 and #16's `Preview Validation` runs (both post-dating the
secret being added). The URL resolution step is working correctly — it
resolved `https://redlined1-icx31nrt8-redlined1-s-projects.vercel.app`, a
properly `redlined1-s-projects`-scoped URL, ruling out the stray `d1-imports`
race as the cause of these particular failures.

Yet the failures show page navigations landing on **Vercel's own SSO login
page** (`getByTestId('login/email-button')`, `getByRole('button', { name:
'Show other options' })` — those are Vercel's account-login component names,
not this app's), and `/manifest.json` / `/sw.js` both 302. That means the
`x-vercel-protection-bypass` header is being sent (per `playwright.config.ts`)
but Vercel isn't honoring it for this deployment — which, with the URL
confirmed correct, leaves one explanation: **the
`VERCEL_AUTOMATION_BYPASS_SECRET` GitHub secret's value doesn't match what
Vercel currently expects** (never matched, or rotated since).

Added a fast pre-check (`.github/workflows/preview-validation.yml`, step
"Verify the protection bypass actually works") that curls `/manifest.json`
with the same header Playwright would send, *before* installing browsers and
running the suite. If the secret is wrong it now fails in ~2 seconds with an
explicit message, instead of a confusing Playwright failure 8 minutes in that
reads like an app bug.

**What only you can do, still:** regenerate the bypass value.
1. Vercel dashboard → `redlined1` project → **Settings → Deployment
   Protection → Protection Bypass for Automation** → regenerate it, copy the
   new value.
2. Update the GitHub secret:
   ```bash
   gh secret set VERCEL_AUTOMATION_BYPASS_SECRET --repo odeyt/redlined1
   ```
3. Push any commit (or re-run the workflow on an open PR) — the new
   pre-check step will confirm immediately whether it now works.

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
