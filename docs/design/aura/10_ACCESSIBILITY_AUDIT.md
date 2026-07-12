# Part 10 — Accessibility Audit

Ratings use PASS / WATCH / FAIL / NOT SPECIFIED, per mission instructions.

## Computed contrast ratios (WCAG relative-luminance formula)

All ratios computed directly from the hex values in DESIGN.md's frontmatter
(not estimated) using the standard sRGB relative-luminance method.

| Foreground | Background | Ratio | AA normal text (4.5:1) | AA large text (3:1) | Verdict |
|---|---|---|---|---|---|
| `#171717` (text-main) | `#FAFAFA` (surface-bg) | **17.2:1** | Pass | Pass | **PASS** — exceeds AAA (7:1) |
| `#737373` (text-muted) | `#FAFAFA` | **4.54:1** | Pass (barely) | Pass | **WATCH** — clears AA by only 0.04, no margin for sub-pixel rendering/anti-aliasing variance; avoid using at small sizes below 14px or thin font weights |
| `#A3A3A3` (text-light) | `#FAFAFA` | **2.42:1** | Fail | Fail | **FAIL** — unusable as body/label text on the light background; DESIGN.md never specifies where this token is meant to be used (Part 1), so there is a real risk it gets used as text and ships inaccessible |
| `#FFFFFF` (button text) | `#B42318` (primary button bg) | **6.57:1** | Pass | Pass | **PASS** — white text on the primary red button is safely readable |
| `#059669` (success) as text | `#FFFFFF` | **3.77:1** | Fail | Pass | **WATCH** — only safe as large text (18px+/bold 14px+) or as a non-text graphical indicator (badge fill, icon), not as small body-text-colored success messaging |
| `#F59E0B` (warning) as text | `#FFFFFF` | **2.15:1** | Fail | Fail | **FAIL** — amber text directly on white/off-white fails at every text size; must only be used as an icon fill, a badge background with dark text on top, or against the dark `#171717` surface |
| `#F59E0B` (warning) as icon/text | `#171717` (dark section bg) | **8.36:1** | Pass | Pass | **PASS** — this is exactly where DESIGN.md places amber warning flags (the dark "Intelligent Service Advisor" section, line 96), so the actual specified usage is safe; the FAIL above only applies if warning color is reused on a light background elsewhere |

**Net finding:** the palette is safe as long as `text-light` (#A3A3A3) is
never used for text, `success`/`warning` are used as large-text/icon/badge
treatments rather than small body text on light backgrounds, and warning
amber stays confined to the dark section where DESIGN.md already places it.
None of these are things DESIGN.md's own written rules currently guarantee —
they are implicit in "get lucky and only use it where it happens to work,"
which is exactly the kind of usage-ambiguity risk flagged in Part 1.

## Structural/interaction checks

| Item | Rating | Notes |
|---|---|---|
| Heading hierarchy | NOT SPECIFIED | DESIGN.md defines `h1`/`h2` typographic tokens and claims (Accessibility section, line 117) "logical heading progression from H1 down to H4," but no actual page content/copy exists to verify real heading order against (see Part 8) — the claim is aspirational, not checkable. |
| Keyboard navigation | NOT SPECIFIED | No focus-order, skip-link, or keyboard-interaction guidance anywhere in the document. |
| Visible focus indicator | NOT SPECIFIED | No focus-ring color/style token exists. This ties to Part 2's "Blue for standard focus" gap — a focus color is *implied* by that one sentence but never defined as a token, size, or offset. |
| Color contrast (palette) | See table above | Mixed — see per-color verdicts. |
| CTA labels | WATCH | DESIGN.md only describes CTA *visual treatment* ("Red Fill / White Border," line 82), never actual CTA text/labels or `aria-label` guidance. Cannot confirm CTA labels will be descriptive (e.g. "Start Free Trial" vs. a bare "Start") until real copy is authored. |
| Logo alt/aria labels | FAIL (as currently implemented) | `lib/logo.ts` exports a raw base64 PNG string with no accompanying alt-text convention documented anywhere; DESIGN.md doesn't address logo `alt` text at all, and Part 7 already found the logo asset system itself is underbuilt relative to the spec's expectations. |
| Pricing toggle semantics | NOT SPECIFIED | No pricing toggle exists in DESIGN.md (only a static 3-column grid) — nothing to check. |
| Calculator labels | NOT SPECIFIED | No calculator exists (Part 5) — nothing to check. |
| Form error states | NOT SPECIFIED | No form is described anywhere in DESIGN.md. |
| FAQ accessibility | NOT SPECIFIED | No FAQ section exists (Part 8) — nothing to check. |
| Reduced motion | NOT SPECIFIED | Motion section (lines 103-106) describes smooth-scroll and hover transitions but never mentions `prefers-reduced-motion`. Should be added at implementation time (see Part 9). |
| Touch targets | NOT SPECIFIED | No explicit minimum tap-target size (e.g. 44×44px) is defined anywhere, despite the document explicitly discussing mobile mockups and "mobile is hinted via high-contrast buttons" (line 72). |
| Table responsiveness | NOT SPECIFIED | No table/comparison content exists yet in DESIGN.md (Part 6) to check responsive behavior for. |
| Mobile menu | FAIL (as currently specified) | Line 72's "mobile is hinted via high-contrast buttons" is not an accessible mobile-navigation pattern — it is not a real specification of a menu, disclosure pattern, or `aria-expanded` state at all. This needs to be designed properly, not "hinted," before implementation. |
| Semantic landmarks | NOT SPECIFIED | No mention of `<nav>`, `<main>`, `<footer>`, or ARIA landmark roles anywhere in the document (expected, since this is a token/style spec rather than markup spec — flagged for the implementation phase, not as a defect in the spec itself). |

## Summary

| Rating | Count |
|---|---|
| PASS | 3 (text-main/bg, button text/bg, warning-on-dark) |
| WATCH | 3 (text-muted/bg, success-as-text, CTA labels) |
| FAIL | 3 (text-light/bg, warning-as-text-on-light, mobile menu as specified) |
| NOT SPECIFIED | 11 |

**Overall accessibility posture of the token system itself is good** (the
core text/background pair is excellent, 17.2:1) but **the document provides
almost no interaction-level accessibility guidance** because it is a
visual/token spec, not a full implementation spec. The three FAILs
(text-light contrast, warning-as-light-background-text, and the
under-specified mobile menu) must be resolved before implementation, and are
carried into Part 11's normalized spec with explicit usage restrictions
rather than removed tokens (the colors themselves are fine — they just need
usage rules).
