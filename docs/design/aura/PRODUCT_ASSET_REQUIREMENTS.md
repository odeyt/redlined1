# Product Asset Requirements — Landing Preview

No image-generation tool is available in this environment, and no rights exist to source real customer screenshots (production data must never be exposed on a public marketing page per `CLAUDE.md` and the mission's safety rules). Every visual mockup on `/landing-preview` is therefore a **component-based CSS/SVG mockup using clearly fictitious sample data**, built directly in the relevant `components/marketing/*.tsx` file — not a real screenshot, not a placeholder image, not an externally sourced photo.

## Mockups required and their treatment

| Section | Asset | Treatment |
|---|---|---|
| Command Center | Action-queue table mockup | Static JSX table, sample rows like "Stale Estimate — 3 days no response — $X,XXX (illustrative)". No real dollar figures presented as fact. |
| Vehicle Intelligence | Vehicle history/risk-signal card | Static JSX card, fictitious plate/VIN pattern (e.g. "Sample Vehicle — 2018 Sedan") — no real VIN format that could be mistaken for a real vehicle record. |
| Estimates / Repair lifecycle | Step-flow diagram | Inline SVG pill-and-connector diagram, text labels only. |
| Service Advisor | Estimate line-review mockup | Static JSX list with sample line items and trust badges (Evidence-based, Human-reviewed, etc.). |
| Customer Intelligence | Relationship timeline mockup | Static JSX timeline with a fictitious customer label ("Sample Customer") and illustrative numbers. |
| Repair Intelligence | Diagnostic tree mockup | Static JSX tree: Symptom → Tests → Resolution, sample data only. |
| Mobile mechanic | Phone-frame mockup | CSS-framed `<div>` simulating a phone viewport with a simplified step list inside — not a real screenshot. |
| Morning Brief | Small summary card | Static JSX card with illustrative counts, embedded in the Command Center section. |
| Built inside a real shop | Structured illustration | Inline SVG (bay/workflow motif), no stock photography, no real shop photo (rights not confirmed for this epic). |

## Data sanitization rules (apply to every mockup, no exceptions)

- No real customer names — use "Sample Customer," "Customer A," or similarly generic labels.
- No real VINs — any vehicle identifier shown must be obviously illustrative (e.g., "VIN •••• (sample)"), never a real 17-character VIN pattern from production data.
- No real phone numbers or addresses.
- No real invoice/payment amounts presented as historical fact — every dollar figure is either a calculator output (clearly formula-driven from user-editable inputs) or explicitly labeled "illustrative"/"sample data."
- No real photos of the D1 Imports shop or staff (no confirmed usage rights obtained during this epic).

## Missing assets (explicitly not fabricated)

- A real product-tour video: does not exist; the "Watch Product Tour" CTA scrolls in-page instead of linking to a nonexistent file.
- A 1200×630 Open Graph / Twitter Card image: does not exist yet; documented as a requirement in the Master Spec's SEO section but not created here (out of scope — requires real design asset production, not fabricable from a docs/code pass).
- Real shop photography for the "Built inside a real shop" section: not available with confirmed usage rights; CSS/SVG illustration used instead, per the recommendation already in `DESIGN_VERIFIED.md`.
