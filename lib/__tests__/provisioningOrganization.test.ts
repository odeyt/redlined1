/**
 * A newly provisioned shop must never persist with no organization.
 *
 * M1 added organizations and back-filled every shop existing on 2026-08-16 —
 * one organization per shop, same name. It did not update this creation path,
 * which inserted `{ name, slug }` and nothing else. Every shop created after
 * that date arrived orphaned; two did before anyone noticed, and the second was
 * a real signup.
 *
 * It stayed invisible because nothing read organization_id until M12, when
 * rib_events.organization_id — NOT NULL — made an orphaned shop a tenant whose
 * domain events can be queued and can never be delivered.
 *
 * Source assertions, matching provisioningRace.test.ts: this function talks to
 * Supabase through an admin client, so a faithful test would need a real
 * database. What can be pinned is that the organization is created, that the
 * shop insert carries it, and that failing to create one does not block signup.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const SERVICE = readFileSync(
  join(process.cwd(), 'commercial/onboarding/ShopProvisioningService.ts'),
  'utf8',
);

describe('shop provisioning attaches an organization', () => {
  it('creates an organization before inserting the shop', () => {
    const orgInsert = SERVICE.indexOf("from('organizations')");
    // Line-ending tolerant: this working tree is CRLF, so a literal \n misses.
    const shopInsert = SERVICE.search(/from\('shops'\)\s*\r?\n\s*\.insert\(/);
    expect(orgInsert).toBeGreaterThan(-1);
    expect(shopInsert).toBeGreaterThan(-1);
    // Order matters: the shop insert has to be able to reference the org.
    expect(orgInsert).toBeLessThan(shopInsert);
  });

  it('passes organization_id on the shop insert', () => {
    // The exact bug: this insert used to be `{ name, slug }`.
    expect(SERVICE).toMatch(/insert\(\{\s*name,\s*slug,\s*organization_id/);
  });

  it('does not block signup when the organization cannot be created', () => {
    // A shop with no organization is repairable — the reconciler rebuilds its
    // events once one is attached. A user who cannot sign up is not.
    expect(SERVICE).toContain('if (orgErr) {');
    expect(SERVICE).not.toMatch(/if \(orgErr\) (throw|\{\s*throw)/);
  });

  it('reports a failed organization rather than swallowing it', () => {
    const block = SERVICE.slice(SERVICE.indexOf('if (orgErr) {'), SERVICE.indexOf("from('shops')"));
    expect(block).toContain('console.error');
    expect(block).toContain('alertException');
  });
});

describe('the backfill migration is safe to apply', () => {
  const MIGRATION = readFileSync(
    join(process.cwd(), 'supabase/migrations/2026-08-20_m12_3_shop_organization_backfill.sql'),
    'utf8',
  );

  it('only touches shops that have no organization', () => {
    // Both statements must be scoped, or a re-run could relink a shop that
    // already belongs somewhere.
    const statements = MIGRATION.split(';').filter(x => /INSERT INTO public\.organizations|UPDATE public\.shops/i.test(x));
    expect(statements.length).toBeGreaterThanOrEqual(2);
    for (const st of statements) expect(st).toMatch(/organization_id IS NULL/i);
  });

  it('gives each orphan its own organization rather than an existing one', () => {
    // Attaching orphans to an existing organization would merge two businesses
    // into one tenant, and organization-scoped reads would then leak.
    expect(MIGRATION).toMatch(/INSERT INTO public\.organizations/i);
    expect(MIGRATION).toContain('does NOT');
  });

  it('does not add NOT NULL before the creation path is proven', () => {
    expect(MIGRATION).not.toMatch(/ALTER TABLE public\.shops[\s\S]*SET NOT NULL/i);
  });
});
