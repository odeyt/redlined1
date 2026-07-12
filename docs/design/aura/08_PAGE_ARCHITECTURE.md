# Part 8 — Page Architecture Audit

## Finding: DESIGN.md defines a partial visual sequence, not a full IA

`docs/design/aura/DESIGN.md`'s "Page Sections" block (lines 75-102) lists
five sections in order, with visual/compositional notes for each. This is
useful as a *style* reference for those five sections but is not a complete
information architecture — it covers roughly a quarter of the mission's
recommended 23-section order.

## What DESIGN.md actually specifies, in the order given

1. **Global Navigation** (line 76) — sticky glassmorphic bar, logo left,
   utility nav right (Sign In, Trial CTA).
2. **Hero Section** (line 80) — centered text stack, layered device mockups,
   "Engine v2.0" pill, two CTAs.
3. **Business Context / Trust Section** (line 85) — split 2-column, benefit
   checklist + shop imagery placeholder.
4. **OS Workflow** (line 89) — horizontal scrollable process pills, Intake
   to Intelligence.
5. **Intelligence Feature Blocks** (line 93) — alternating 2-column blocks:
   Owner Intelligence, Intelligent Service Advisor (dark), Repair Case.
6. **Pricing / Future Roadmap** (line 99) — 3-column current/rollout/future
   grid.

That's it — six sections, ending at Pricing. There is no FAQ, no Final CTA,
no Footer described in Page Sections (Footer/FAQ may reasonably be assumed
implicit in any real page, but DESIGN.md doesn't describe them, so nothing
can be verified about their content or order).

## Gap against the mission's recommended order

| Mission's recommended section | Present in DESIGN.md? |
|---|---|
| Navigation | Yes |
| Hero | Yes |
| Trust/built-inside-a-real-shop | Yes ("Business Context / Trust Section") |
| Industry pain points | **Absent** |
| Traditional software comparison | **Absent** (see Part 6) |
| Time-savings calculator | **Absent** (see Part 5) |
| Revenue opportunity calculator | **Absent** (see Part 5) |
| Repair lifecycle workflow | Yes ("OS Workflow") |
| Owner Command Center | Partially — "Owner Intelligence" feature block covers this conceptually but doesn't use the product's actual name (see Part 3) |
| Repair Intelligence | Yes ("Repair Case" block) |
| Vehicle Intelligence | **Absent** by name (real feature exists in code, per Part 3, just not named here) |
| Intelligent Service Advisor | Yes |
| Customer Lifetime Intelligence | **Absent** by name (real feature exists in code, not named here) |
| Migration/switch section | **Absent** (see Part 4) |
| Mobile mechanic section | **Absent** — notable, since the live production page's actual top marketing angle is heavily mobile-mechanic-focused (`SLIDES` array in `app/portal/page.tsx` leads with "Built for Mobile Mechanics"). DESIGN.md doesn't mention mobile mechanics at all despite the Hero mockup including a floating mobile-device visual. |
| Multi-location section | **Absent** (real feature — `shop_mirrors` — not mentioned) |
| AI philosophy | **Absent** |
| Product evolution roadmap | Partially — "Pricing / Future Roadmap" combines pricing and roadmap into one section rather than treating them separately |
| Pricing | Yes (combined with roadmap) |
| Reliability | **Absent** |
| FAQ | **Absent** |
| Final CTA | **Absent** |
| Footer | **Absent** |

**Coverage: roughly 6 of 23 recommended sections are addressed, and even
those 6 are visual/compositional notes rather than full copy.**

## Section-order sanity check (for what does exist)

The six sections that are specified follow a defensible order: Nav → Hero →
Trust → Workflow → Feature deep-dives → Pricing. Nothing is out of place
relative to itself. The main structural risk is that **Pricing appears to be
the last section described**, with no Reliability, FAQ, or Final CTA
described afterward — if implemented literally as "the last section," a real
page would end abruptly after pricing with no objection-handling (FAQ) or
final conversion push. This is very likely just because DESIGN.md stops
early (it's a partial spec), not because the Aura tool intended pricing to be
the true final section.

## Classification

**BLOCKER for "page architecture readiness"** — as with Parts 4-6, this
reflects a scope gap in the 126-line source document, not a defect in what
exists. A full page cannot be implemented from DESIGN.md's Page Sections
block alone; it would need roughly 17 additional sections authored (pain
points, comparison, both calculators, Vehicle Intelligence, Customer
Lifetime Intelligence, migration, mobile mechanic, multi-location, AI
philosophy, standalone roadmap, reliability, FAQ, final CTA, footer) before
matching the mission's recommended conversion journey. Part 11 will not
invent this missing content; Part 13's "conversion clarity" score reflects
the gap honestly.
