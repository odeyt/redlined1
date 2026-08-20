-- M12.3 — every shop belongs to exactly one organization
--
-- ## What is wrong
--
-- M1 (2026-08-16) added organizations and back-filled one per existing shop,
-- same name. It did not update the shop CREATION path, so every shop created
-- after that date arrived with organization_id NULL. Two did before it was
-- noticed: "E2E Audit Shop" and "AutoQ", both created 2026-08-17.
--
-- ## Why it matters
--
-- rib_events.organization_id is NOT NULL. A shop with no organization can queue
-- domain events that the relay can never deliver: it marks them dead after
-- burning eight attempts. One such event exists today, from the M12.2 proof.
--
-- ## The invariant this restores
--
-- Every shop belongs to exactly one organization. A solo shop gets its own
-- single-shop organization — that is the model M1 established, and it means
-- nothing downstream has to special-case a tenant without one.
--
-- ## What this deliberately does NOT do
--
-- It does not attach the orphaned shops to any EXISTING organization. The
-- database does not know which shops belong together, and guessing by owner or
-- by name prefix would silently merge two unrelated businesses into one tenant
-- — which, with organization-scoped reads, means one shop's data becoming
-- visible to another. Each orphan gets its own organization, named after
-- itself, exactly as M1 did. Grouping is a separate, reviewable decision.
--
-- It does not add NOT NULL to shops.organization_id. The creation path is
-- fixed in this same commit, but a constraint added before every path is
-- proven safe turns a provisioning bug into a failed signup. That comes after
-- this has been in production and the count has held at zero.
--
-- Safe to re-run: every statement is scoped to organization_id IS NULL.

BEGIN;

-- One organization per orphaned shop, same name. The slug suffix keeps it
-- unique: two shops may legitimately share a name, and organizations.slug is
-- UNIQUE.
INSERT INTO public.organizations (name, slug)
SELECT s.name, COALESCE(s.slug, lower(regexp_replace(s.name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-org'
FROM public.shops s
WHERE s.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.slug = COALESCE(s.slug, lower(regexp_replace(s.name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-org'
  );

UPDATE public.shops s
SET organization_id = o.id
FROM public.organizations o
WHERE s.organization_id IS NULL
  AND o.slug = COALESCE(s.slug, lower(regexp_replace(s.name, '[^a-zA-Z0-9]+', '-', 'g'))) || '-org';

COMMIT;

-- ── Verification (run after COMMIT) ─────────────────────────────────────────

SELECT 'shops with no organization (expect 0)' AS check_name, count(*)::text AS result
  FROM public.shops WHERE organization_id IS NULL
UNION ALL
SELECT 'shops total', count(*)::text FROM public.shops
UNION ALL
SELECT 'organizations total', count(*)::text FROM public.organizations
UNION ALL
-- No organization may end up holding shops that were not already together.
SELECT 'organizations holding >1 shop (expect 1: D1 Imports)', count(*)::text
  FROM (SELECT organization_id FROM public.shops
         WHERE organization_id IS NOT NULL
         GROUP BY organization_id HAVING count(*) > 1) x;
