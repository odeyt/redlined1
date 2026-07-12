# Part 4 — Migration and Switching Section Audit

## Finding: no migration section exists in DESIGN.md

`docs/design/aura/DESIGN.md` is 126 lines and, per Part 1, is a design-token
and illustrative-page-notes spec, not a full page-copy document. It contains
**zero references** to migration, switching platforms, data export/import,
or any competing shop-management product by name. There is no headline, no
service-tier structure, no visual-flow description, and no data-category list
that could be evaluated against the mission's required migration content.

This is reported honestly rather than inventing content the source document
does not contain.

## What the mission requires (for reference, not yet satisfied)

- Headline positioning: "Switch without losing your shop history." — **absent**
- Explanation of export-format-based migration + assisted import — **absent**
- Careful, non-absolute wording patterns ("Compatible with supported export
  formats," "Migration capabilities vary by platform," etc.) — **absent**
  (nothing to word carelessly, but also nothing written carefully — the
  section simply does not exist)
- Three service levels (Self-Service Import / Assisted Migration /
  White-Glove Migration) — **absent**
- Visual flow (Export → upload → field mapping → duplicate detection →
  validation → review → go live) — **absent**
- Supported data categories (customers, vehicles, invoices, estimates, repair
  orders, appointments, parts, inventory, technician notes, repair history)
  — **absent**
- Disclaimers about unsupported fields / source-system limitations — **absent**

## What the actual product supports today (ground truth, for future authoring)

Real capability found in the repository:

- Parts bulk XLS/CSV import exists (`features/parts/PartsView.tsx`,
  `PartsOrdersView.tsx`, `PartsEstimatesView.tsx` reference SheetJS-based
  import; confirmed by `CLAUDE.md`'s "Parts bulk XLS import — smart header
  detection... column alias mapping" note under Recent Completed Work).
- No evidence of a general-purpose, multi-entity migration pipeline (no
  field-mapping UI, no duplicate-detection service, no named connectors for
  Tekmetric/Shopmonkey/Shop-Ware/AutoLeap/etc. were found anywhere in
  `features/`, `app/api/`, or `commercial/`).
- No public API or ETL layer for pulling data out of a competitor system was
  found (`app/api/` has no `import`, `migration`, or `export` routes).

**Conclusion:** the actual product today supports, at most, a
"Self-Service Import" tier limited to parts/inventory via spreadsheet upload.
It does **not** currently support Assisted Migration or White-Glove Migration
as distinct offered service tiers, and it does not support importing
customers, vehicles, invoices, estimates, repair orders, or appointments from
any format — this was not found in the codebase during this audit.

## Recommendation

Before a migration section can be added to a "verified" design spec, it must
be **authored from scratch** against the real, current import capability
(parts/CSV only) or against a committed near-term roadmap item, not
retrofitted from marketing aspiration. Two honest options exist:

1. Scope the migration section narrowly to what's true today: "Import your
   parts and inventory via CSV/Excel" with a clear "full-shop migration:
   contact us" framing for everything else, avoiding any of the disallowed
   claims (no automated competitor migration, no named-partner integrations).
2. Treat migration/switching messaging as an explicit **PLANNED** roadmap
   item and do not publish a live "Migration" nav section until the
   Self-Service/Assisted/White-Glove tiers actually exist as product
   capability.

This audit does not select between the two — that is a product/business
decision for the owner — but it flags that **no migration content should be
fabricated into Part 11's normalized spec.** Part 11 will mark this gap
explicitly rather than inventing migration copy.

## Classification

**BLOCKER for "migration-focused positioning" readiness** (per the mission's
stated goal of verifying the design is "suitable for migration-focused
positioning") — the source document currently provides nothing to position.
This is not a defect in DESIGN.md's existing content; it is a scope gap that
must be closed by a future content-authoring pass before the page can satisfy
the mission's migration requirement.
