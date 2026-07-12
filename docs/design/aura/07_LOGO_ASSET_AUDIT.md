# Part 7 — Logo and Brand-Asset Audit

## Component existence check

The mission asked to verify `components/brand/RedlineD1Logo.tsx`. **This file
does not exist.** A repo-wide search (`**/*RedlineD1Logo*`) returned zero
matches. There is no `components/brand/` directory-based logo component of
any kind in the codebase.

## What actually exists: `lib/logo.ts`

The real, current logo source is `lib/logo.ts`, which exports a single
constant:

```ts
export const LOGO_SRC = `data:image/png;base64,iVBORw0KGgo...`;
```

This is a **single embedded base64-encoded raster PNG image**, not a
component, not an SVG, and not a system with variants. Key findings:

1. **No variant system exists.** DESIGN.md's expected characteristics list
   full/compact/monochrome/tagline variants — none of these exist. There is
   exactly one image, used everywhere `LOGO_SRC` is imported.
2. **No design-direction match can be confirmed or denied visually from code
   alone** — since it's a compiled base64 PNG blob, this audit cannot verify
   from source code whether it depicts a "performance gauge, speedometer arc,
   forward-motion geometry, italic performance wordmark" as DESIGN.md's
   expected direction describes, or whether it's a wordmark-only image, or
   something else. **This must be visually inspected by a human/rendered
   preview before Part 11's normalized spec can claim the current logo
   matches the design direction.** Flagging as **NOT VERIFIABLE FROM CODE —
   requires visual confirmation.**
3. **Raster-only format is itself a technical concern independent of the
   visual design.** A base64 PNG cannot scale losslessly, cannot be
   recolored via CSS for dark/light variants, and cannot easily produce the
   full/compact/monochrome/tagline variant set DESIGN.md expects. An SVG- or
   component-based logo (matching the expected `RedlineD1Logo.tsx` path)
   would be required to satisfy "compatible with light/dark backgrounds"
   and "readable at small sizes" without shipping multiple separate raster
   files.

## Usage confirmation

`app/portal/page.tsx` imports `LOGO_SRC` from `@/lib/logo` (confirmed at
line 5 of that file) and uses it as the marketing header image. This
matches the mission's note that "the current logo is referenced via
`LOGO_SRC` from `@/lib/logo`."

## Use-case coverage check

| Expected use case | Current support |
|---|---|
| Marketing header | Yes — `LOGO_SRC` is used in `app/portal/page.tsx` |
| Mobile navigation | Not independently verified — same single asset would presumably be reused, but no responsive/compact variant exists to size down gracefully |
| Footer | Not verified — no footer section was inspected in this docs-only audit (out of scope; no runtime code was to be modified) |
| Favicon concept | Not found — no `favicon.ico` / `icon.png` App Router convention file was located referencing this logo asset during this audit's searches |
| Social preview (OG image) | Not found — no Open Graph image asset referencing this logo was located |
| Loading state | Not found |
| Future app icon | Not applicable — no native app exists (confirmed in Part 3) |

## "Redline Motors" distinction

DESIGN.md's expected characteristics ask the logo to be "distinct from any
'Redline Motors' reference." No reference to "Redline Motors" was found
anywhere in the codebase or in DESIGN.md itself — there is nothing to
conflict with. **No violation found**, but also nothing to confirm distinctness
against since the comparison target doesn't appear anywhere in this repo.

## Invoice/customer-document extension check

Per the mission's constraint ("do not extend the logo into invoices/customer
documents until separately approved"), a quick check confirms `LOGO_SRC` is
imported in `app/portal/page.tsx` (marketing) — this audit did not find it
imported into invoice, estimate, or repair-order PDF/print templates within
the scope of files checked. This is a **pass** on the stated constraint as
observed, but was not exhaustively verified across every invoice-rendering
code path, since that would require modifying scope beyond this docs-only
audit's file list.

## Classification

| Issue | Classification |
|---|---|
| `components/brand/RedlineD1Logo.tsx` does not exist; DESIGN.md's expected asset path is aspirational, not real | IMPORTANT |
| Current logo is a single raster PNG blob with no variant system (full/compact/monochrome/tagline) | IMPORTANT — blocks satisfying DESIGN.md's own asset requirements |
| Visual match to "gauge/speedometer/forward-motion/italic wordmark" direction cannot be confirmed from source code | NOT VERIFIABLE FROM CODE — needs human visual review before sign-off |
| No favicon/OG-image/loading-state asset located | MINOR — likely just out of this audit's file scope, needs confirmation, not a confirmed absence |
| No "Redline Motors" naming collision found | ACCEPTABLE — nothing to conflict with |
| No evidence logo has leaked into invoices/customer documents | ACCEPTABLE (as observed) |

**Overall: logo asset system is not yet built to the standard DESIGN.md
describes.** Before implementation, either (a) commission/build the real
`components/brand/RedlineD1Logo.tsx` component with proper variants as an SVG
or component-based asset, or (b) revise DESIGN.md's asset expectations to
match the current single-PNG reality until a proper logo system is built.
Recommend option (a) given the enterprise-credibility brand goal — a single
embedded base64 PNG is inconsistent with "premium automotive SaaS" polish at
the logo level specifically.
