# Part 1 — Structure Validation

Source audited: `docs/design/aura/DESIGN.md` (126 lines: YAML frontmatter, lines 1-37; markdown body, lines 39-126).

## Section inventory

| Requested section | Present? | Location |
|---|---|---|
| version | Yes (frontmatter) | line 2 (`alpha`) |
| name | Yes (frontmatter) | line 3 |
| description | Yes (frontmatter) | line 4 |
| colors | Yes (frontmatter + body) | lines 5-16, 42-47 |
| typography | Yes (frontmatter + body) | lines 17-23, 48-53 |
| spacing | Yes (frontmatter only) | lines 24-27 |
| border radius | Yes (frontmatter `rounded` + body `Shapes`) | lines 28-31, 65-68 |
| components | Yes (frontmatter + body) | lines 32-36, 69-74 |
| overview | Yes | lines 39-40 |
| layout | Yes | lines 54-59 |
| elevation and depth | Yes | lines 60-64 |
| shapes | Yes | lines 65-68 |
| page sections | Yes | lines 75-102 |
| motion and interaction | Yes | lines 103-106 |
| accessibility | Yes | lines 114-118 |
| assets | Yes | lines 119-126 |
| do's and don'ts | Yes | lines 108-112 |

Structurally the document is complete against the requested checklist — every
named section exists. It is, however, a **design-token + narrative style
guide**, not a page-copy/IA spec. There is no hero copy, no pricing copy, no
FAQ, no migration copy, no ROI calculator copy, no footer, no nav link list.
This matters for Parts 4/5/6/8 below and is flagged there rather than invented
here.

## Issues found

### BLOCKER

1. **Frontmatter component tokens reference undefined interpolation targets
   correctly, but `nav-glass` and `status-badge` are not represented anywhere
   in `rounded` or `colors` consistently** — not a blocker by itself, but see
   Important #1 below for the real frontmatter/body conflict. Downgraded —
   no true BLOCKER-level defect (malformed YAML, broken build, or unusable
   values) was found. The frontmatter parses as valid YAML and all referenced
   `{colors.x}` / `{rounded.x}` tokens in `components` resolve to values that
   do exist in the same frontmatter block.

   *(Listed here only to record that the check was performed — no blocker
   downgrades needed; see IMPORTANT and MINOR for actual findings.)*

### IMPORTANT

1. **Duplicate/conflicting color definition source of truth.** Colors are
   defined twice: once as flat hex tokens in frontmatter (lines 5-16) and
   again in prose in the `## Colors` body section (lines 42-47). The prose
   version introduces a color the frontmatter never defines — **"Blue for
   standard focus"** (line 45) — with no hex value, no token name, and no
   corresponding frontmatter entry. This is an undefined value: any
   implementer would have to invent a blue rather than read one from spec.

2. **`text-light: "#A3A3A3"` (frontmatter line 13) is never referenced
   anywhere in the body.** Its intended use (tertiary text? disabled state?)
   is ambiguous — implementation ambiguity, not a missing value per se, but
   there is no rule telling an implementer where to apply it versus
   `text-muted`.

3. **Iconography is named by a specific vendor library that is not present
   in the actual codebase.** Line 67: "Solar-linear and Solar-bold icons."
   No `@iconify/*`, no `solar-icon-set`, and no icon package of that name
   exists in `package.json`. This is an implementation-ambiguity /
   non-standard dependency claim — see Part 9 for the runtime risk (the
   `Assets` section separately says icons come from a CDN `iconify-icon`
   script, which is a different and worse problem — see Part 9 BLOCKER).

4. **Heading hierarchy claim in Accessibility ("logical H1 to H4") is not
   testable against anything in this file** — there is no H3/H4 usage
   documented anywhere in Page Sections, so the claim is aspirational rather
   than backed by the spec's own content. Not itself wrong, but unverifiable
   from the document alone (see Part 10).

5. **`h1` and `h2` tokens omit `lineHeight` for `h2`** (line 20 has no
   `lineHeight` key, unlike `h1` at line 19 and `body-lg`/`body-md`). Missing
   value — implementer must guess or reuse `h1`'s 1.05, which is very tight
   for a 36px heading and may cause descender clipping in some fonts.

### MINOR

6. **Component naming is not standardized to a single case convention.**
   Frontmatter keys use kebab-case (`button-primary`, `nav-glass`,
   `status-badge`) while body section headers use Title Case prose
   ("Dashboard Cards", "Process Nodes") with no explicit mapping between the
   two. A component-name lookup table would remove ambiguity when this spec
   is handed to an implementer.

7. **`glow-subtle` gradient (line 46) is named and described ("3% opacity
   Red... vertical heat-map effect") but has no token entry anywhere in
   frontmatter** — it exists only as body prose. Minor because the
   description is precise enough to reimplement, but it breaks the
   token/prose parity used everywhere else.

8. **Non-standard property names**: `tracking` (frontmatter typography,
   e.g. line 19) is a Tailwind-ism (`letter-spacing` in CSS). Not wrong, but
   worth normalizing during Part 11 since this repo has no Tailwind
   installed (see Part 9) — the raw CSS property name will reduce
   ambiguity for a hand-rolled implementation.

9. **"container-max: 1280px" vs. body's parenthetical `(max-w-7xl)`** (line
   26 vs. line 56) — `max-w-7xl` in Tailwind's default scale is 80rem =
   1280px, so these are numerically consistent, but citing a Tailwind
   utility class name inside a spec for a codebase that has no Tailwind
   (confirmed — no `tailwind.config.*`, no `tailwindcss` in
   `package.json`) is a latent implementation-ambiguity trap for whoever
   builds this without checking Part 9 first.

### ACCEPTABLE

10. Frontmatter YAML itself is well-formed: correctly quoted string scalars,
    consistent 2-space indentation, no tab characters, no invalid nesting.
    Parsed cleanly.

11. `rounded.default` (6px) vs. body's "Standardized 6px (rounded-md)" (line
    66) are consistent.

12. Color contrast pairing named in Accessibility (`#171717` on `#FAFAFA`)
    is in fact very high contrast — see Part 10 for the computed ratio. No
    issue.

13. No genuinely "impossible" responsive rule was found — the document
    does not specify breakpoints at all, so there is nothing to contradict
    (this absence is itself flagged as a gap under Part 9, not a structural
    contradiction).

## Summary

- **BLOCKER:** 0 (none found at the document-parsing level; see Part 9 for a
  runtime-risk BLOCKER unrelated to structure — CDN Tailwind + CDN icon
  script in `Assets`).
- **IMPORTANT:** 5
- **MINOR:** 4
- **ACCEPTABLE:** 4 (confirmed-fine, listed for completeness)

The document is internally parseable and does not contain contradictions
severe enough to block reading it, but it is a **token/style spec with
illustrative page-section notes**, not a full page-copy IA document. Treat
Parts 4/5/6/8 findings as "not present" rather than "present but broken."
