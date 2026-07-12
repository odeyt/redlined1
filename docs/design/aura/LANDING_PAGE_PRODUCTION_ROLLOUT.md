# Landing Page Production Rollout Plan

This document is a plan only. This epic (`feature/landing-page-master-spec-preview`) does not execute any of these steps beyond building the isolated `/landing-preview` route itself. No production replacement, no push, no deploy.

## Sequenced steps

1. **Review preview.** Owner reviews `/landing-preview` end to end (desktop and mobile) once it is reachable - see the open access-control item below, which must be resolved first.
2. **Replace incomplete assets.** Swap the component-based CSS/SVG mockups (Command Center, Vehicle Intelligence, etc. - see `PRODUCT_ASSET_REQUIREMENTS.md`) for real sanitized screenshots or refined mockups once available, and produce the missing Open Graph/Twitter Card image documented in the Master Spec's SEO section.
3. **Validate every CTA.** Re-confirm each CTA destination in `M2_CHANGE_MANIFEST.md` still points where intended, especially after any routing changes elsewhere in the app.
4. **Confirm product status.** Re-verify `PRODUCT_STATUS_MATRIX.md` against the then-current codebase before publishing - features may have moved from PARTIAL/PLANNED to AVAILABLE NOW (or vice versa) since this epic was authored.
5. **Confirm canonical pricing.** Re-confirm the Pricing section's values against whichever plan-definition system is canonical at that time (this epic intentionally did not resolve the three-system pricing ambiguity noted in `commercial/plans/planCatalog.ts`'s own header comment - that architecture decision belongs to the owner).
6. **Confirm billing remains safely gated**, or make an explicit, owner-approved decision to enable it - do not silently flip `NEXT_PUBLIC_BILLING_ENABLED` as a side effect of a marketing-page rollout.
7. **Run an accessibility review** (axe/Lighthouse or manual screen-reader pass) beyond what this epic's Playwright tests cover.
8. **Run a performance review** (Lighthouse/Core Web Vitals) once real images replace the CSS/SVG mockups, since real images change the performance profile.
9. **Capture a rollback snapshot of the current homepage** (`app/portal/page.tsx` as it exists today) before any replacement, so reverting is a simple file restore.
10. **Replace the homepage only after explicit owner approval** - this is a one-way decision affecting the production entry point; do not automate it.
11. **Keep the old homepage route/component available temporarily** (e.g. at `/portal` or `/legacy`) so a fast rollback is possible without a redeploy from git history.
12. **Monitor analytics and errors** after any production change - wire the events documented in the Master Spec's Analytics section into the real GA property, and watch Sentry (`@sentry/nextjs` is already a dependency) for any new error spikes.

## Rollback

Rollback for the preview-only state built in this epic is trivial: do not merge `feature/landing-page-master-spec-preview`, or `git revert` it if merged. Nothing on `/`, `/portal`, or any authenticated route is touched. Rollback for a future production replacement (step 10 above) means restoring the snapshot captured in step 9.

## Open item this plan depends on

Step 1 (review preview) currently cannot happen for an unauthenticated reviewer: `/landing-preview` is not reachable by a logged-out visitor today, because `middleware.ts`'s `publicPaths` allowlist does not include it (see `M2_CHANGE_MANIFEST.md`'s "BLOCKED ITEM" section for full detail on why this wasn't fixed inside this epic - it requires explicit owner sign-off on a change to shared authentication-gating code). This must be resolved before Part 29's visual review can be completed with real screenshots, and before any real external stakeholder can view the preview link.
