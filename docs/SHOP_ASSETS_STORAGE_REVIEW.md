# `shop-assets` Storage Bucket — Review

**Status: reviewed, NOT changed.** Flipping the bucket to private without first migrating every caller to signed URLs would break every existing image (vehicle photos, DVI photos, logos) across the live app immediately — this needs your explicit approval and a coordinated code change, not a silent flip.

## Current state (confirmed via `docs/LIVE_PRODUCTION_SECURITY_VERIFICATION.md`, §11 and repo-wide grep)

- `storage.buckets.public = true` for `shop-assets` — confirmed live.
- Every caller (`services/*ImageService.ts`) uses `getPublicUrl()` exclusively — a repo-wide grep found zero uses of `createSignedUrl()`.
- Object paths are **not** shop-namespaced (`vehicles/{vehicleId}/...`, `{entityType}s/{entityId}/...`) — a path leaks no shop identity, but any object URL, once known or guessed, is fetchable forever by anyone, logged-in or not.
- Object-level storage RLS policies (who may `INSERT`/`UPDATE`/`DELETE`) were not resolvable from the REST probe used in the original audit — `docs/SUPABASE_SQL_AUDIT_SCRIPT.sql` §9 covers this; still needs to be run (see below).

## Risk

Vehicle photos, DVI inspection photos (which can include odometer readings and VIN plates), and — once mobile ships — diagnostic screenshots and signatures, are all publicly fetchable by anyone who has or can guess/enumerate a URL. Enumerability itself depends on ID guessability (Postgres UUIDs are effectively unguessable; the entity ids used in paths are checked to be UUIDs), which limits practical exploitability today, but this is not a substitute for real access control, and it will not hold once the mobile app ships and a wider audience can inspect network traffic.

## Recommended remediation (not applied — requires a coordinated code change across every `*ImageService.ts`)

1. Set `storage.buckets.public = false` for `shop-assets`.
2. Add storage object-level RLS policies scoping `INSERT`/`SELECT`/`UPDATE`/`DELETE` to `shop_id = ANY(my_shop_ids())`, which requires the object path to actually encode `shop_id` (see item 3).
3. Migrate every `*ImageService.ts` caller to shop-id-prefixed paths (`shops/{shopId}/vehicles/{vehicleId}/...`) and `createSignedUrl()` with a short expiry, replacing every `getPublicUrl()` call.
4. Update every frontend component that renders these URLs to handle a signed-URL refresh (they expire) rather than a permanent public link.

This is a larger, cross-cutting change (touches every image upload/display path in both the web app and the forthcoming mobile app) — scoping it as its own follow-up task, per the original audit's recommendation, rather than bundling it into this security pass. Flag if you want it prioritized before or after the mobile store submission.

## What this means for the mobile app (in progress)

The mobile app will read these same public URLs for now (no code change needed to *read* — `getPublicUrl()` results work in any client). It will **not** implement any new upload path that assumes public URLs are acceptable long-term; new mobile upload code will be written against signed URLs from day one if photo upload ships before this bucket migration lands, so it isn't adding new debt on top of the existing gap.
