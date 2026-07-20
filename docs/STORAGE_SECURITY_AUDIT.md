# Storage Security Audit

Phase 6 of the mobile-production-readiness task. Supersedes/expands
[`SHOP_ASSETS_STORAGE_REVIEW.md`](SHOP_ASSETS_STORAGE_REVIEW.md) (kept for
history) into this task's required bucket-by-bucket format. **All findings
below are CODE INFERENCE ONLY** — `storage.buckets.public` and
`storage.objects` policies were not queried live (no database access this
session; `docs/MOBILE_RLS_AUDIT.sql` Section 9 covers both and should be run
before treating anything here as confirmed).

**Do not build mobile uploads until this passes** — this task's own
instruction, restated: photo/document upload is explicitly out of scope for
this task's mobile work regardless of storage state, and remains blocked
after this task too until the findings below are resolved.

## Buckets found

**`shop-assets` is the only Supabase Storage bucket referenced anywhere in
this codebase** — confirmed via a repo-wide search for `.storage.from(`,
`createBucket`, `getPublicUrl`, `createSignedUrl`: every hit (5 files —
`entityImageService.ts`, `vehicleImageService.ts`, `partsService.ts`,
`shopSettingsService.ts`, `inspectionService.ts`) uses the same bucket name.

| Property | Value | Source |
|---|---|---|
| Public/private | **Public** (as of the 2026-07-16 live probe cited by `SHOP_ASSETS_STORAGE_REVIEW.md` — not independently re-checked this session; `MOBILE_RLS_AUDIT.sql` §9 re-verifies) | `SHOP_ASSETS_STORAGE_REVIEW.md` |
| Upload policy | **UNKNOWN — never queried live.** Uploads go through the **client-side, anon-key-authenticated** Supabase client directly (`services/entityImageService.ts:59`, `services/vehicleImageService.ts`, `services/inspectionService.ts:264` all call `supabase.storage.from('shop-assets').upload(...)` from browser code, not a server route) — meaning `storage.objects` RLS policy is the *entire* authorization boundary for uploads today, with no API-layer check as a backstop. | Code read directly |
| Read policy | Bucket is public → `getPublicUrl()` results are fetchable by anyone with the URL, authenticated or not, no policy needed | Code + prior live probe |
| Update policy | UNKNOWN — no `.update()` call found on storage objects; uploads use `upsert: false` (`entityImageService.ts:59`) or `upsert: true` (`inspectionService.ts:264`, overwrites in place) | Code read directly |
| Delete policy | **UNKNOWN — never queried live.** Deletes also go through the client-side authenticated client directly (`services/entityImageService.ts:77`, `services/vehicleImageService.ts:60`, `services/partsService.ts:171`) | Code read directly |
| Object-path convention | **Not shop-namespaced.** `entityImageService.ts:52`: `` `${entityType}s/${entityId}/${Date.now()}.${ext}` `` — no `shop_id` segment anywhere in the path. Same pattern in `vehicleImageService.ts` and `inspectionService.ts`. | Code read directly |
| Shop isolation | **None at the path level** — a path alone carries no shop identity a storage policy could scope against without joining back to the owning metadata table (`entity_images`/`vehicle_images`, both themselves `UNKNOWN`/no-RLS-confirmed per `DATABASE_SECURITY_FINDINGS.md`) | Derived from the path convention above |
| Signed URL behavior | **Not used anywhere.** A repo-wide grep for `createSignedUrl` found zero matches — every read path uses `getPublicUrl()` exclusively | Code read directly |

## Sensitive file types in this bucket

Per the entity types actually uploaded (`EntityType` in
`entityImageService.ts`: `job_card`, `repair_order`, `appointment`,
`parts_order`, `parts_estimate`; plus `vehicleImageService.ts` for vehicle
photos, `inspectionService.ts` for DVI inspection photos, and
`shopSettingsService.ts` for shop logos): vehicle photos, DVI/diagnostic
photos (can include odometer readings and VIN plates, per the existing
review), job-card/repair-order/parts-order attachment photos, shop logos.
**No dedicated "signature" or "customer document" upload path exists in
this codebase today** — the "digital signature" feature found elsewhere in
this repo (inspection/estimate approval flows, `app/inspection/[token]/page.tsx`)
is a **typed name stored as a text field** on the inspection/estimate
approval record itself, not a file upload — so there is no separate
signature-file exposure to audit in Storage specifically, only in whichever
Postgres table stores that approval record (covered in
`DATABASE_SECURITY_FINDINGS.md` under `inspections`/`estimates`). Invoices
and estimates themselves are rendered as pages, not stored as uploaded PDF
files in this bucket, per this repo's grep results — no dedicated
"invoice/estimate document" upload path was found either.

## Required production behavior vs. current state

| Requirement | Current state |
|---|---|
| Sensitive buckets private | **Not met** — `shop-assets` is public |
| No anonymous upload | **UNKNOWN, likely not met** — no storage object policy confirmed; the bucket's default PostgREST-adjacent Storage grants typically allow `anon` unless explicitly restricted, and nothing in this repo's SQL restricts them |
| No anonymous delete | **UNKNOWN, likely not met**, same reasoning |
| Access tied to authenticated shop membership | **Not met** — no path-based or policy-based shop scoping exists at all |
| Object paths include stable tenant/shop scope | **Not met** — confirmed, paths never include `shop_id` |
| Client cannot claim a different shop path without authorization | **N/A / not met** — moot today since paths don't encode shop at all, so there's no shop claim to validate in the first place |
| Signed URLs short-lived where used | **N/A** — signed URLs aren't used anywhere; every URL is a permanent public link |

## Remediation applied this session (minimal, non-breaking)

`supabase/migrations/20260720_06_storage_policies.sql` (drafted, not
applied) adds exactly one thing: **`INSERT`/`UPDATE`/`DELETE` on
`storage.objects` for the `shop-assets` bucket restricted to the
`authenticated` role** (blocking `anon` specifically), with no other
change. This is deliberately minimal:

- It closes the two clearest, cheapest-to-fix gaps ("no anonymous upload",
  "no anonymous delete") without requiring any application code change.
- It does **not** attempt shop-path scoping, since that requires the
  coordinated, cross-cutting migration `SHOP_ASSETS_STORAGE_REVIEW.md`
  already scoped out as its own follow-up: rewriting every
  `*ImageService.ts` call site to a shop-prefixed path, flipping the
  bucket to private, and switching every read from `getPublicUrl()` to
  `createSignedUrl()` with UI changes to handle refresh. Attempting that
  inside this already-large task, without live confirmation of current
  policy state first, risks breaking every existing image in the live app
  (per the original review's own warning) — sequencing it as an explicit,
  separately-approved follow-up is the safer choice.
- It does **not** flip the bucket to private — doing so before every
  `getPublicUrl()` caller is migrated to `createSignedUrl()` would break
  every existing image immediately, which the original review already
  flagged and which remains true.

## What this means for mobile

Confirmed unchanged from the prior mobile session's finding: the mobile app
does not implement any upload path yet (explicitly out of scope for this
task and the prior one). If/when Phase 3 mobile work (camera uploads) is
approved to begin, it must be built against **signed URLs and shop-scoped
paths from day one** — not the current public-URL pattern — so it doesn't
add new debt on top of this gap. This is a hard prerequisite, not a
nice-to-have, given the mobile app ships the same public anon key in a
distributable binary.
