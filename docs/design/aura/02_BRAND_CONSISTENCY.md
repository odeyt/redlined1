# Part 2 — Brand Consistency Audit

Approved brand direction: premium automotive SaaS, modern industrial,
restrained red accent, near-black typography, off-white backgrounds,
realistic product mockups, enterprise credibility. No cartoon visuals, no
generic AI gradients, no playful startup-template aesthetic, no fake
racing clichés, no copied competitor branding.

## Color value check

| Token | DESIGN.md | Approved brand value | Match |
|---|---|---|---|
| Primary red | `#B42318` | `#B42318` | Exact match |
| Primary hover | `#991B12` | dark red `#7F1D1D` (or equivalent) | **Mismatch** — see below |
| Surface dark | `#171717` | `#171717` | Exact match |
| Surface bg (off-white) | `#FAFAFA` | `#FAFAFA` | Exact match |
| Surface white | `#FFFFFF` | `#FFFFFF` | Exact match |
| Border light | `#E5E5E5` | `#E5E5E5` | Exact match |
| Success | `#059669` | `#059669` | Exact match |
| Warning | `#F59E0B` | `#F59E0B` | Exact match |

**Finding — primary-hover mismatch (IMPORTANT):** The brand brief approves
"dark red `#7F1D1D` or equivalent" for the secondary/hover red. DESIGN.md
instead defines `primary-hover: #991B12`, a lighter, more saturated red (closer
to a mid-tone crimson than the near-maroon `#7F1D1D`). `#991B12` is plausibly
"or equivalent" — it is a darkened step from `#B42318` and stays in the same
hue family — but it is measurably lighter than `#7F1D1D` (Lightness ~35% vs
~26% in HSL). This should be confirmed with the owner as an intentional
"or equivalent" choice rather than silently accepted, since hover-state red on
a `#B42318` button is one of the most visible brand touchpoints on the page.
Classify: **IMPORTANT — confirm intentional, not a blocker.**

No other color deviates. No unapproved colors are introduced as *tokens*
(the frontmatter is clean); the one loose color mentioned only in prose —
"Blue for standard focus" (line 45, no hex given) — is a gap already flagged
in Part 1 Important #1, and also matters here: an unspecified blue risks
drifting from the approved palette entirely if an implementer picks an
arbitrary blue. Recommend it be defined explicitly (e.g. a single accessible
focus-ring blue) in Part 11's normalized spec, not left to guesswork.

## Naming consistency

Token names (`primary`, `surface-bg`, `text-main`, `text-muted`, `border-light`)
are consistent between frontmatter and prose. No aliasing conflicts (e.g. no
place calls `#B42318` anything other than "Red" / "primary" / "Brand Core").

## Dark-mode usage

Dark mode is scoped narrowly and appropriately: only the "Intelligent Service
Advisor" feature block is called out as using `#171717` as a section
background (line 96), not a full site-wide dark theme. This matches
enterprise-credible restraint — dark mode isn't used gratuitously. No
conflicting dark-mode text-contrast values are defined for that block (e.g.
what text color runs on `#171717` inside that section isn't stated — an
IMPORTANT gap, since `text-main: #171717` obviously cannot be reused as
foreground text on a `#171717` background; the spec would produce invisible
text if followed literally there). **Classify: IMPORTANT.**

## Text contrast (see Part 10 for full computed ratios)

- `#171717` on `#FAFAFA`: contrast ratio ≈ 17.9:1 — exceeds WCAG AAA (7:1).
  Excellent, consistent with "high contrast" brand promise.
- `#737373` (text-muted) on `#FAFAFA`: ≈ 4.6:1 — passes AA for normal text
  (4.5:1) but only barely; fine for body copy at 14px/400 weight but the
  spec should avoid using `text-muted` at sizes/weights below what AA
  requires. See Part 10.
- `#A3A3A3` (text-light) on `#FAFAFA`: ≈ 2.3:1 — **fails AA entirely** for
  any normal text use. This token is only safe for large decorative text,
  disabled states, or non-text UI elements. Since the spec never states
  where `text-light` is used (Part 1 Important #2), there's a real risk an
  implementer puts it on body copy and ships an inaccessible page.
  **Classify: IMPORTANT** (ties to Part 10 FAIL finding).

## CTA color usage

The "Do's and Don'ts" section explicitly states: "Don't use the brand red for
large background areas; it is strictly an accent color" (line 111) and "Do use
high-contrast for numbers/metrics" (line 109). This is exactly the restrained-
accent direction the brand brief requires. The one CTA description in Page
Sections ("Two primary CTAs (Red Fill / White Border)", line 82) is consistent
with a single dominant red CTA plus a secondary outline CTA — not overused.
No section describes more than one filled-red CTA per view. **Pass.**

## Gradients

Only one gradient is mentioned: `glow-subtle`, "3% opacity Red" radial glow in
the hero (line 46). 3% opacity is genuinely subtle and consistent with
"no generic AI gradients" — this is not a saturated purple/blue SaaS-template
gradient, it's a faint brand-color vignette. **Pass**, though as noted in
Part 1 it has no frontmatter token (cosmetic/process gap, not a brand-fit
problem).

## Semantic color usage

Success (`#059669` emerald) and warning (`#F59E0B` amber) are used exactly as
labeled — "verified/positive outcomes" and "flags" respectively (line 45) —
and the Accessibility section correctly requires icon+color pairing for
colorblind users (line 116). No semantic color is repurposed for a
non-semantic decorative use anywhere in the document. **Pass.**

## Visual-cliché check (cartoon / generic-AI / racing-cliché / competitor-copy)

- No mention of checkered flags, tachometers-as-decoration, cartoon mascots,
  or racing-stripe motifs anywhere in the document. The one automotive visual
  metaphor used — "Redline" as a brand name and a red accent color — is
  restrained and does not lean into racing clichés.
  **Pass.**
- No generic AI-template visual signatures (no purple/blue gradient mesh,
  no glowing orb, no neural-net line art) are described. The "glow-subtle"
  gradient is red at 3% opacity — brand-colored, not generic-AI-purple.
  **Pass.**
- No mockup of a competitor's UI or copied layout is referenced by name.
  **Pass** (nothing to check against — the document doesn't cite any
  competitor by name at all, which is itself fine here and directly relevant
  to Part 6).
- "Realistic product mockups" requirement: Page Sections describes "Overlapping
  Desktop mockup (1000px wide), Floating Mobile mockup (260px wide)" (line 83)
  — consistent with realistic device-frame mockups rather than illustrated/
  cartoon devices. **Pass**, though the document doesn't confirm these
  mockups show *real* RedlineD1 product screens versus placeholder/lorem
  content — that's an implementation detail outside what a token spec can
  verify; flag for the implementation team to use actual Command Center /
  Job Card screenshots, not invented UI.

## Summary of brand-consistency issues

| # | Issue | Classification |
|---|---|---|
| 1 | `primary-hover` (#991B12) is lighter than the approved "#7F1D1D or equivalent" dark red | IMPORTANT — confirm with owner |
| 2 | "Blue for standard focus" has no defined hex value | IMPORTANT |
| 3 | Dark-mode section (#171717 bg) has no defined foreground text color, risking invisible text | IMPORTANT |
| 4 | `text-light` (#A3A3A3) fails AA contrast on `#FAFAFA` and has no usage rule | IMPORTANT (ties to Part 10) |

No BLOCKER-level brand violations found. Core palette, restraint on red,
absence of clichés, and semantic color discipline all match the approved
direction. The four IMPORTANT items above should be resolved before this
becomes a production spec — they are addressed in Part 11's normalized
version.
