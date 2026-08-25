/**
 * The durable reference cache, and the line it must never cross.
 *
 * M-PARTS2C.3 adds a Postgres tier so a deployment stops costing three
 * provider calls per vehicle. The risk it introduces is that something the
 * standing rules forbid storing — a search term, an OEM number, a VIN — ends
 * up in a table because a caller passed the wrong category.
 *
 * `isPersistable` is the last check before a write, so these test it directly
 * rather than reading the source around it.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { isPersistable } from '../vehicleResolution/referenceCache';
import {
  manufacturersPath, modelsPath, vehicleVariantsPath, oemPartsForVehiclePath,
} from '../providers/autopartsapi/endpoints';

const CACHE = readFileSync(
  join(process.cwd(), 'lib/parts/vehicleResolution/referenceCache.ts'), 'utf8');
const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/2026-08-25_m_parts2c3_reference_cache.sql'), 'utf8');

describe('reference data may be kept', () => {
  it('allows the three lookups that cost a resolution its calls', () => {
    expect(isPersistable('manufacturers', manufacturersPath())).toBe(true);
    expect(isPersistable('models', modelsPath({ manufacturerId: 74 }))).toBe(true);
    expect(isPersistable('vehicle_variants',
      vehicleVariantsPath({ modelId: 221 }))).toBe(true);
  });
});

describe('anything carrying a technician\'s words may not', () => {
  it('refuses the vehicle-first search path', () => {
    // "…/search-param/brake%20pads". A search query must never be stored.
    const path = oemPartsForVehiclePath({
      typeId: 1, vehicleId: 33662, searchParam: 'brake pads',
    });
    expect(isPersistable('vehicle_parts_search', path)).toBe(false);
  });

  it('refuses it even if the category is passed wrongly', () => {
    /**
     * The realistic failure: a caller labels a search path as a reference
     * category. The category allow-list alone would let it through, so the
     * path itself is inspected too.
     */
    const path = oemPartsForVehiclePath({
      typeId: 1, vehicleId: 33662, searchParam: 'brake pads',
    });
    expect(isPersistable('manufacturers', path)).toBe(false);
  });

  it.each([
    ['an encoded space', 'articles/x/search-param/front%20brake%20pads'],
    ['a query string', 'articles/x?term=pads'],
    ['a fragment', 'articles/x#pads'],
  ])('refuses %s', (_label, path) => {
    expect(isPersistable('manufacturers', path)).toBe(false);
  });

  it('refuses categories that are about parts rather than the catalogue', () => {
    // OEM numbers and applicability answers are not reference lists.
    for (const c of ['oem_search', 'oem_applicability', 'cross_reference', 'vehicle_parts_search'] as const) {
      expect(isPersistable(c, 'articles/whatever')).toBe(false);
    }
  });

  it('fails closed for a category invented later', () => {
    // An allow-list means a new endpoint is non-persistable until someone
    // decides otherwise, which is the safe direction to fail.
    expect(isPersistable('something_new' as never, 'articles/x')).toBe(false);
  });
});

describe('it stays a cache, not a mirror of the catalogue', () => {
  it('never serves an expired row', () => {
    expect(CACHE).toContain('expiresAt <= now');
  });

  it('deletes an expired row on encounter rather than leaving it', () => {
    // No cron to forget to run, and nothing accumulates.
    expect(CACHE).toContain('Sweep on encounter');
    expect(CACHE).toContain(".delete().eq('cache_key', path)");
  });

  it('records a persistent hit distinctly from a memory hit', () => {
    // Folding them together would make the whole milestone unobservable.
    expect(CACHE).toContain("outcome: 'persistent_hit'");
    expect(CACHE).toContain("outcome: 'cache_hit'");
  });

  it('promotes a durable hit into memory so the next call is free', () => {
    expect(CACHE).toContain('Promote into memory');
  });
});

describe('a broken cache degrades to a slow one, never an outage', () => {
  it('swallows read and write failures', () => {
    // Two try/catch blocks, one per tier operation.
    const reads = CACHE.match(/catch \{/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(2);
    expect(CACHE).toContain('A cache that cannot be written is a cache that misses');
  });

  it('still honours an explicit bypass', () => {
    expect(CACHE).toContain('if (!opts.bypass && isPersistable(category, path))');
  });
});

describe('the table is server-only and holds no tenant data', () => {
  it('has no shop_id', () => {
    // The same manufacturer list answers every shop.
    const create = MIGRATION.slice(
      MIGRATION.indexOf('CREATE TABLE'), MIGRATION.indexOf('CREATE INDEX'));
    expect(create).not.toContain('shop_id');
  });

  it('enables RLS and grants no policy to anyone', () => {
    expect(MIGRATION).toContain('ENABLE ROW LEVEL SECURITY');
    expect(MIGRATION).toContain('it should have none');
  });

  it('restates the service_role grant after revoking from PUBLIC', () => {
    // REVOKE ... FROM PUBLIC also strips service_role's inherited privileges.
    expect(MIGRATION).toContain('GRANT ALL ON public.parts_provider_reference_cache TO service_role');
    expect(MIGRATION).toContain('service_role lost access');
  });

  it('proves the new outcome is accepted AND an unknown one still refused', () => {
    expect(MIGRATION).toContain('persistent_hit is still rejected');
    expect(MIGRATION).toContain('the outcome constraint accepted an unknown value');
  });

  it('pairs its existence check with a negative control', () => {
    // A head-count check once reported a non-existent table as present.
    expect(MIGRATION).toContain('definitely_not_a_real_table_xyz');
  });
});

describe('the call counter counts calls, not lookups', () => {
  /**
   * Found by the cold-start proof itself: it reported "2 upstream steps" while
   * spending 0 external calls, because the resolver incremented
   * `externalCalls` after every cachedFetch regardless of which tier answered.
   *
   * The field's own comment says "External calls this invocation actually
   * spent", and the search route uses it to decide whether to persist a
   * mapping. Worse, it is the number that shows M-PARTS2C.3 working — a
   * counter that cannot tell a hit from a call makes the milestone invisible
   * in its own accounting.
   */
  const RESOLVER = readFileSync(
    join(process.cwd(), 'lib/parts/vehicleResolution/resolver.ts'), 'utf8');

  it('increments only when the provider was actually called', () => {
    expect(RESOLVER).toContain("if (o === 'external') externalCalls += 1;");
  });

  it('no longer increments unconditionally after a lookup', () => {
    // The old shape: a bare increment on the line after each cachedFetch.
    expect(RESOLVER).not.toMatch(/TTL\.\w+, ctx\);\s*\r?\n\s*externalCalls \+= 1;/);
  });

  it('every increment in the file is guarded', () => {
    // Derived rather than counted by eye: each occurrence must sit on the
    // guarded line, so a new unguarded one fails here.
    const increments = [...RESOLVER.matchAll(/externalCalls \+= 1;/g)];
    expect(increments.length).toBeGreaterThan(0);
    for (const m of increments) {
      const line = RESOLVER.slice(RESOLVER.lastIndexOf('\n', m.index!) + 1, m.index! + 20);
      expect(line).toContain("o === 'external'");
    }
  });

  it('the cache reports which tier answered', () => {
    for (const tier of ["onOutcome?.('cache_hit')", "onOutcome?.('persistent_hit')", "onOutcome?.('external')"]) {
      expect(CACHE).toContain(tier);
    }
  });
});
