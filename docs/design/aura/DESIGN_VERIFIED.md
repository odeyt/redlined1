---
version: verified-1.0
name: RedlineD1 Automotive OS
description: A high-density, professional SaaS platform for automotive repair shop management and business intelligence, characterized by a clean neutral palette with high-contrast red accents.
source: docs/design/aura/DESIGN.md (Aura-generated alpha spec, see DESIGN_DIFF_REPORT.md for every change made here)
colors:
  primary: "#B42318"
  primary-hover: "#991B12"          # CONFIRM WITH OWNER — brand brief approves "#7F1D1D or equivalent"; #991B12 is lighter/more saturated. Kept as-authored pending explicit sign-off; do not treat as final until confirmed (see 02_BRAND_CONSISTENCY.md).
  surface-bg: "#FAFAFA"
  surface-white: "#FFFFFF"
  surface-dark: "#171717"
  text-main: "#171717"
  text-on-dark: "#FAFAFA"           # ADDED — foreground for the #171717 dark section; original spec never defined this and would have produced invisible black-on-black text.
  text-muted: "#737373"             # Use only at 14px+ / 400+ weight. Contrast on surface-bg = 4.54:1 (AA, minimal margin).
  text-light: "#A3A3A3"             # RESTRICTED — 2.42:1 on surface-bg, FAILS WCAG AA at any text size. Decorative/non-text use only (dividers, disabled-state icon tints). Never use for body copy, labels, or captions.
  border-light: "#E5E5E5"
  success: "#059669"                # 3.77:1 on white — safe as large text/icon/badge fill; NOT safe as small body text on light backgrounds.
  warning: "#F59E0B"                # 2.15:1 on white (FAILS at any text size) but 8.36:1 on surface-dark (PASSES). Confine to the dark section usage already specified, or use only as an icon/badge fill with a dark outline on light backgrounds.
  focus-ring: "#2563EB"             # ADDED — original spec referenced an undefined "Blue for standard focus" with no token. This is a standard accessible focus-indicator blue; swap for brand preference but do not ship with an undefined focus color.
typography:
  fontFamily: "'Inter', system-ui, sans-serif"
  h1: { size: "72px", weight: "500", lineHeight: "1.05", tracking: "-0.025em" }
  h2: { size: "36px", weight: "500", lineHeight: "1.15", tracking: "-0.025em" }   # lineHeight ADDED — original omitted it; 1.05 (h1's value) is too tight for 36px and risks descender clipping.
  body-lg: { size: "20px", weight: "400", lineHeight: "1.6" }
  body-md: { size: "14px", weight: "400", lineHeight: "1.5" }
  caption: { size: "12px", weight: "500", tracking: "0.05em" }
spacing:
  section-py: "128px"
  container-max: "1280px"           # Implement as a literal 1280px max-width; this codebase has no Tailwind installed, so do not reference "max-w-7xl" as if the utility class exists here (see 09_TECHNICAL_IMPLEMENTABILITY.md).
  gap-md: "24px"
rounded:
  default: "6px"
  panel: "16px"
  full: "9999px"
components:
  button-primary: { bg: "{colors.primary}", text: "{colors.surface-white}", radius: "{rounded.default}" }
  button-secondary: { bg: "{colors.surface-white}", border: "{colors.border-light}", text: "{colors.text-main}" }
  nav-glass: { bg: "rgba(250, 250, 250, 0.85)", blur: "12px", borderBottom: "1px solid rgba(0, 0, 0, 0.04)" }
  status-badge: { size: "10px", weight: "600", padding: "2px 6px" }
  focus-outline: { color: "{colors.focus-ring}", width: "2px", offset: "2px" }   # ADDED — pairs with focus-ring token above.
---

## Status of this document

This is the **normalized, implementation-ready** version of the Aura-generated
spec at `docs/design/aura/DESIGN.md`. It preserves the original's visual
direction (colors, typography, layout, elevation, component shapes) and:

- Fixes internal contradictions and missing values found in
  `01_STRUCTURE_AUDIT.md`.
- Applies brand-consistency corrections from `02_BRAND_CONSISTENCY.md`.
- Rewords or removes unsupported/ambiguous product claims found in
  `03_PRODUCT_CLAIM_AUDIT.md`.
- Adds explicit placeholders (not fabricated content) for the migration,
  ROI-calculator, and competitive-comparison sections that do not yet exist
  — see `04_MIGRATION_SECTION_AUDIT.md`, `05_ROI_CLAIM_AUDIT.md`,
  `06_COMPETITIVE_COMPARISON_AUDIT.md`.
- Notes the real state of the logo asset system from
  `07_LOGO_ASSET_AUDIT.md`.
- Flags the page-architecture coverage gap from `08_PAGE_ARCHITECTURE.md`.
- Removes the two CDN runtime dependencies flagged as BLOCKER in
  `09_TECHNICAL_IMPLEMENTABILITY.md`.
- Adds accessibility usage restrictions from `10_ACCESSIBILITY_AUDIT.md`.

It does **not** overwrite `docs/design/aura/DESIGN.md`, which remains
untouched as the original record.

## Overview
RedlineD1 is an Automotive Business Operating System designed with a focus on
high-density information display, professional reliability, and data-driven
decision making. The visual personality is clinical and organized, utilizing
a strict Inter-based typographic hierarchy and a neutral gray-scale palette.
The brand's signature "Redline Red" (#B42318) is used sparingly for primary
actions, critical alerts, and branding highlights. The layout emphasizes
depth through layered mockups, subtle shadows, and glassmorphism in the
navigation. It presents a "command center" tone that balances traditional
shop ruggedness with modern SaaS intelligence.

## Colors
- **Brand Core**: Red (#B42318) used for branding and critical
  "attention-needed" UI elements.
- **Neutral Palette**: Neutral 50 (#FAFAFA) for page backgrounds, Neutral 900
  (#171717) for dark sections/text, and neutral border grays for structure.
- **Semantic Highlighting**: Emerald (#059669) for verified/positive outcomes
  (large-text/icon/badge use only — see contrast note above), Amber
  (#F59E0B) for flags (dark-section or badge-fill use only — see contrast
  note above), and a defined Focus Blue (#2563EB) for keyboard-focus
  indicators (replaces the original's undefined "Blue for standard focus").
- **Gradients**: A subtle radial glow (`glow-subtle`, 3% opacity Red) creates
  a vertical heat-map effect in the hero section. Kept as-is — genuinely
  subtle, consistent with "no generic AI gradients."
- **Dark-section text**: Any content placed on the `#171717` surface must use
  `text-on-dark` (#FAFAFA) or `#FFFFFF`, never `text-main` (#171717), which
  would be invisible against its own background.

## Typography
- **Primary Type**: Inter (weights 400, 500, 600), loaded via `next/font/google`
  at build time — not a remote `<link>` request (see Assets, below).
- **Headings**: Tight tracking and moderate font weights (Medium 500) provide
  an authoritative but non-aggressive feel. `h2` now has an explicit
  `lineHeight: 1.15` (added — see frontmatter note).
- **Metadata**: Heavy use of 10px-12px uppercase tracking for category labels
  and "Intelligence" tags.
- **Readability**: High line-heights (1.6+) for body paragraphs.

## Layout
- **Grid System**: Standard 12-column logic, 50/50 or 60/40 splits for
  text/mockup pairs.
- **Container**: Literal 1280px max-width. (This codebase has no Tailwind
  installed — do not reference `max-w-7xl` as an available utility class.)
- **Header**: Fixed 64px glassmorphic top navigation, 12-column sub-grid.
- **Vertical Rhythm**: 96px-128px between major sections.

## Elevation & Depth
- **Nav Glass**: 12px blur, low-opacity border.
- **Mockup Shadow**: `0 12px 48px -12px rgba(0,0,0,0.08)`.
- **Panel Shadow**: Softer, inset shadows for dashboard cards.

## Shapes
- **Corner Radius**: 6px (buttons/inputs), 16px (containers/cards), full
  radius (status pills).
- **Iconography**: Use a locally-installed, tree-shakeable icon package
  (e.g. `lucide-react`) for a soft, rounded aesthetic. Do **not** load an
  icon set from a runtime CDN script (the original spec's
  `code.iconify.design` reference is removed — see Assets, below, and
  `09_TECHNICAL_IMPLEMENTABILITY.md` BLOCKER #2).

## Components
- **Buttons**: Square-edged (minimal radius) primary buttons with subtle box
  shadows. Hover shifts Red → Dark Red (pending confirmation of the exact
  hover shade — see frontmatter note on `primary-hover`).
- **Dashboard Cards**: White/off-white containers, 1px borders, bottom-aligned
  metadata row, status indicator.
- **Navigation**: Desktop uses text-links with color shifts. **Mobile
  navigation must be a real, accessible pattern** — a disclosure
  (hamburger → full-screen or slide-in drawer) with `aria-expanded`, a focus
  trap while open, Escape-to-close, and 44×44px minimum touch targets. The
  original spec's "mobile is hinted via high-contrast buttons" (line 72) is
  not an implementable specification and must not be built literally — see
  `10_ACCESSIBILITY_AUDIT.md` FAIL finding.
- **Process Nodes**: Rounded-pill connectors for the "Repair Lifecycle"
  workflow.
- **Focus State**: All interactive elements get a visible 2px `focus-ring`
  outline with 2px offset (added — see components frontmatter).

## Page Sections

### Global Navigation
- Sticky glassmorphic bar. Left-aligned logo and main nav; right-aligned
  utility (Sign In, Trial CTA).
- **CTA destination note (ADDED):** the Trial CTA must route to the actual
  trial-signup flow only. It must **not** be wired to a live billing/checkout
  path — billing is intentionally disabled in production
  (`NEXT_PUBLIC_BILLING_ENABLED=false`, confirmed in `CLAUDE.md` Hard
  Constraint #4). See `03_PRODUCT_CLAIM_AUDIT.md`.
- Low-contrast text (Neutral 500) until hover (Neutral 900).

### Hero Section
- Centered text stack, layered mockup composition (Overlapping Desktop
  mockup ~1000px wide, Floating Mobile mockup ~260px wide, small "Morning
  Brief" card — Morning Brief is a real, shipped feature, confirmed
  AVAILABLE NOW in `03_PRODUCT_CLAIM_AUDIT.md`).
- **REMOVED:** "RedlineD1 Engine v2.0" pill notification. No versioned
  "Engine" concept exists anywhere in the product or codebase — this read as
  a fabricated technical-maturity claim (classified UNSUPPORTED in Part 3).
  Replace with a truthful, non-versioned badge if a hero pill is desired
  (e.g. a feature-name badge, not a fake version number).
- Two primary CTAs (Red Fill / White Border) — kept, consistent with
  restrained-accent brand direction.

### Business Context / Trust Section
- Split 2-column layout: benefit checklist (left) + shop imagery placeholder
  (right). Background Neutral 100 to differentiate from hero.
- **Recommendation (not a spec change):** since D1 Imports is a real,
  operating two-location shop, use actual (permitted) shop imagery here
  rather than stock/placeholder photography once available, to support the
  "built inside a real shop" trust positioning the mission calls for.

### OS Workflow
- Horizontal scroll-enabled row of process pills (Intake → Intelligence)
  connected by thin gray lines; final node high-contrast dark with dashed
  connector signifying "AI Intelligence." Matches the real repair lifecycle
  (triage → job cards → estimates → repair orders → invoices → payments)
  feeding the Intelligence Bus — confirmed AVAILABLE NOW.

### Intelligence Feature Blocks
- Alternating 2-column blocks:
  - **"Owner Intelligence"** — white cards with red-tinted alert boxes.
    **Dollar figure changed from a specific "$12,450 Stale Estimates" to an
    explicitly illustrative example**, e.g. "$X,XXX in Stale Estimates
    (illustrative example)" or a clearly-labeled "Sample data" badge on the
    mockup — the original specific figure risked being read as a real
    performance/revenue statistic with no evidence behind it (NEEDS
    REWORDING finding in Part 3). Maturity note: the underlying decision-
    dashboard work (SI-5) is still in progress per `CLAUDE.md` — label this
    block **Available Now (core), Rolling Out (full decision-dashboard
    scoring)** rather than implying it's fully complete.
  - **"Intelligent Service Advisor"** — dark mode section (`#171717`
    background, `text-on-dark` foreground — see Colors above), semi-
    transparent gray cards, amber warning flags (safe here — 8.36:1
    contrast on this specific background). Confirmed AVAILABLE NOW.
  - **"Repair Case"** — diagnostic tree (Symptoms → Tests → Resolution).
    Confirmed AVAILABLE NOW as a concept (real evidence-engine capability
    exists per `CLAUDE.md`).
- **Note:** the real product also ships Vehicle Intelligence, Customer
  Lifetime Intelligence, Business Memory, and multi-location support (all
  confirmed real in `03_PRODUCT_CLAIM_AUDIT.md`) but none of these are
  represented in this section. Recommend adding feature blocks for them in a
  future content-authoring pass — see `08_PAGE_ARCHITECTURE.md`.

### Pricing / Future Roadmap
- 3-column grid: current / rollout / future. Dashed borders + 70% opacity for
  future/planned items. **This labeling pattern is correct and should be
  preserved as-is** — it already implements the mission's required
  Available Now / Rolling Out / Planned distinction.

### Migration / Switching Section — NOT YET AUTHORED
No migration content exists in the source spec. See
`04_MIGRATION_SECTION_AUDIT.md` for the full gap analysis and the real
current import capability (parts/CSV only — no full-shop migration pipeline
exists today). **Do not publish migration marketing copy until this section
is authored against real product capability.**

### Time-Savings / ROI Calculator — NOT YET AUTHORED
No calculator content exists in the source spec. See
`05_ROI_CLAIM_AUDIT.md`. Any future calculator must ship with editable
inputs, visible math, "Estimated" labeling, and the required disclaimer:
*"Illustrative estimate only. Actual results depend on shop workflow, usage,
staffing, and data quality."*

### Competitive Comparison — NOT YET AUTHORED
No comparison content exists in the source spec. See
`06_COMPETITIVE_COMPARISON_AUDIT.md`. If authored, use "Traditional shop
software" as the generic label (never a named competitor) and
Standard/Limited/Available/Advanced/Evidence-based/Planned maturity labels
instead of boolean checkmarks.

## Motion & Interaction
- Smooth-scroll behavior enabled globally. Nav bar has `duration-300`
  transition for blur/opacity changes.
- Standard background/text-color hover transitions.
- **"Aura Controls" note clarified:** the original line ("the codebase
  includes specific performance controllers to pause animations...") refers
  to implementation guidance for whoever builds this page — pause
  animations/transitions when the browser tab is inactive — not an existing
  RedlineD1 product feature. Reworded here to remove the ambiguity flagged
  in Part 3.
- **ADDED:** respect `prefers-reduced-motion` — disable non-essential
  scroll/hover transitions for users who request reduced motion.

## Do's and Don'ts
- **Do**: Use high-contrast for numbers and metrics (e.g., $ amounts in
  Neutral 900).
- **Do**: Keep borders subtle and low-opacity (0.05-0.1 range).
- **Do**: Label every illustrative statistic or mockup figure as an example
  (ADDED — closes the "$12,450" gap above).
- **Do**: Keep Sapelee out of all public-facing marketing copy — it is an
  internal-only intelligence-provider abstraction, not a customer-facing
  integration (ADDED, per mission instruction; nothing in the source spec
  violated this, but it's now an explicit rule to prevent future drift).
- **Do**: Keep this page free of testimonials/usage-count claims unless they
  are real and sourced (ADDED — reinforces the removal already done in
  `app/portal/page.tsx`'s prior commits; nothing in the source spec
  violated this either, but stated explicitly to prevent regression).
- **Don't**: Use the brand red for large background areas; it is strictly an
  accent color.
- **Don't**: Overcomplicate the typography; stick to Inter for all
  functional text.
- **Don't**: Use `text-light` (#A3A3A3) for any text content — it fails
  WCAG AA at every size (ADDED).
- **Don't**: Use `warning` (#F59E0B) as text color on light backgrounds —
  confine it to the dark section or icon/badge fills (ADDED).

## Accessibility
- **Contrast**: `#171717` on `#FAFAFA` = 17.2:1 (verified, exceeds AAA).
  `text-muted` clears AA with minimal margin (4.54:1) — avoid small/thin
  usage. `text-light` fails AA entirely (2.42:1) — decorative use only.
  Full computation in `10_ACCESSIBILITY_AUDIT.md`.
- **Visual Cues**: All alerts/status changes use both color and icon
  (Check/Warning) for colorblind accessibility.
- **Hierarchy**: Logical H1→H4 heading progression (verify once real page
  copy exists — see `08_PAGE_ARCHITECTURE.md`, no page copy exists yet to
  check this against).
- **Focus**: All interactive elements must show the `focus-ring` (#2563EB)
  outline on keyboard focus (ADDED).
- **Motion**: Respect `prefers-reduced-motion` (ADDED).
- **Mobile menu**: Must be a real accessible disclosure pattern, not "hinted"
  buttons (ADDED — see Components, above).

## Assets
- **Stylesheets**: Local CSS / CSS variables consistent with the existing
  `app/portal/page.tsx` convention. **This codebase has no Tailwind
  installed — do not use `cdn.tailwindcss.com` or any Tailwind CDN script in
  production** (REMOVED — was a BLOCKER per `09_TECHNICAL_IMPLEMENTABILITY.md`).
- **Icons**: A locally-installed icon package (e.g. `lucide-react`).
  **Do not load an icon runtime from a CDN script** (REMOVED —
  `code.iconify.design` reference was a BLOCKER per
  `09_TECHNICAL_IMPLEMENTABILITY.md`).
- **Fonts**: Inter, loaded via `next/font/google` at build time (CHANGED from
  a remote `fonts.googleapis.com` `<link>` — self-hosting avoids the
  render-blocking external request).

## Logo (see 07_LOGO_ASSET_AUDIT.md for full detail)
- Current production logo asset (`lib/logo.ts`, `LOGO_SRC`) is a single
  embedded base64 raster PNG with no variant system. This does not yet match
  the full/compact/monochrome/tagline variant system implied by the brand
  direction. **Recommend building a real `components/brand/RedlineD1Logo.tsx`
  SVG/component-based logo with proper variants before this design is
  considered launch-ready at the logo level** — this was not something this
  documentation pass could build (out of scope: no runtime code changes),
  but it is a real gap between spec and implementation.
- Whether the current raster logo visually matches the "gauge/speedometer/
  forward-motion/italic wordmark" direction could not be confirmed from
  source code alone — requires human visual review.
