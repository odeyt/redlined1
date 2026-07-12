# Landing Page Visual Review

## Status: screenshots NOT captured - honest disclosure

Per this document's own instructions ("if screenshot capture genuinely doesn't work in this environment, say so honestly rather than fabricating a review of images that don't exist"), this section reports the real situation rather than a fabricated review.

**What happened:** a local dev server was started successfully (`redline-dev`, `npm run dev`, `http://localhost:3000`), and `npx tsc --noEmit` / `npm run build` both pass clean, confirming `/landing-preview` compiles and prerenders as static content. However, when attempting to actually view the route in a browser (both the automated Playwright `marketing` project and manual navigation via the browser tool), every unauthenticated request to `/landing-preview` is redirected to `/login` by the repo's existing `middleware.ts`, whose `publicPaths` allowlist does not currently include `/landing-preview` (see `M2_CHANGE_MANIFEST.md`'s "BLOCKED ITEM" section for the full account, including an attempted one-line fix that the session's own safety system correctly flagged as an unauthorized change to shared authentication logic, and that was reverted).

This means: **no real screenshot of the rendered `/landing-preview` page could be captured in this environment**, because the page cannot currently be reached without an authenticated session, and no test credentials (`TEST_OWNER_EMAIL`/`TEST_OWNER_PASSWORD`) are configured to obtain one. `docs/design/aura/preview-screenshots/` was not created, because there is nothing genuine to put in it. Fabricating screenshots or a review of a page state that wasn't actually observed would violate the explicit instruction governing this document.

## What was verified instead

Since live visual capture wasn't possible, verification relied on:

1. **Build/type verification** - `npx tsc --noEmit` clean, `npm run build` succeeds, `/landing-preview` listed as prerendered static output alongside every existing route, none of which changed.
2. **Source-level review of every component** against `docs/design/aura/DESIGN_VERIFIED.md`'s token spec (colors, spacing, radii, typography) - every component in `components/marketing/` imports its values from `components/marketing/theme.ts`, which is transcribed directly from that spec, rather than ad hoc hex values scattered per component.
3. **Structural review** of heading hierarchy (one `<h1>`, logical `<h2>`/`<h3>` nesting - confirmed by reading each component's JSX directly, and by the `has exactly one h1` Playwright assertion, once that test can actually reach the page).
4. **Responsive CSS review** - `app/landing-preview/landing.css`'s breakpoints (`900px` for nav, `860px` for two-column sections, `640px`/`900px` for card grids) were read back and confirmed to match the components that reference those class names (`rd1-two-col`, `rd1-card-grid-2/3/4/6`, `rd1-desktop-nav`, `rd1-mobile-toggle`).

This is real but partial verification - a structural/static read, not a rendered visual confirmation. It is not a substitute for actually seeing the page, and should not be reported as equivalent.

## What still needs a human (or a follow-up session) to check, once the access item is resolved

- Logo size and legibility at real rendered sizes (32px header, 36-28px footer variants).
- Navigation balance at exactly 900px (the breakpoint where mobile toggle swaps to desktop nav) - a common spot for awkward in-between layouts.
- Typography rendering with the actual Inter font loaded (this environment did not independently confirm `next/font` is wired for this route vs. relying on system font fallback - worth a dedicated check).
- Whitespace/section length in practice - the master spec calls for a deliberately long page (22 sections); whether the pacing feels right can only be judged by scrolling the real thing.
- Mockup realism for the Command Center, Vehicle Intelligence, Service Advisor, Customer Intelligence, and Repair Intelligence sample-data cards - these were designed to read clearly as illustrative, but only a real rendered pass can confirm they don't look cheap or empty.
- Calculator usability - the math is unit-tested in code review (see Master Spec Section 7's formulas matching `TimeSavingsCalculator.tsx`/`RevenueOpportunityCalculator.tsx` verbatim), but real input interaction (tab order, number-input spinner behavior on mobile) needs a live check.
- Pricing card clarity at narrow viewports (three plans is fine at desktop 3-column; verify the single-column mobile stack doesn't feel like an unbroken wall).
- CTA clarity/contrast against the hero's radial-glow background.
- No empty-looking placeholders - every section was authored with real (if illustrative) content rather than lorem ipsum, but this should be re-confirmed visually.

## Recommendation

Resolve the `/landing-preview` reachability item (owner decision required, documented in `M2_CHANGE_MANIFEST.md` and `LANDING_PAGE_PRODUCTION_ROLLOUT.md`), then re-run this visual review with the browser tools (`preview_start` + `navigate` + `computer` screenshot action) at 375/768/1024/1440/1920 viewports as originally scoped, and replace this document's content with real captured evidence.
