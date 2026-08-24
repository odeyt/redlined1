/**
 * Tenant isolation for the M-PARTS2B tables, proved against the real database.
 *
 * Two boundaries, and both are tested because they fail differently:
 *
 *   RLS                 what a member SESSION can read
 *   application layer   what server code does while holding service_role,
 *                       which bypasses RLS entirely
 *
 * The second is the one that matters here. Everything in mappingStore runs as
 * service_role, so a route that forgot to pass the caller's shop would read
 * another shop's mapping quite happily and RLS would never object.
 *
 * Creates two QA mappings on two real shops, then removes them.
 *
 *   npx tsx --conditions=react-server scripts/qa-parts2b-tenant-isolation.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Loaded BEFORE mappingStore is imported. ES imports are hoisted above the
// module body, so a static import of anything that builds a Supabase client
// at module scope would run before this line and see no environment at all —
// which surfaces as "supabaseUrl is required" long after the real cause.
config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/ldjrlvjkmzrcdqhetqoh/.test(url)) {
  console.error('Refusing to run: expected the Redlined1 project.');
  process.exit(2);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

let failed = 0;
const check = (l: string, ok: boolean) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}   ${l}`);
  if (!ok) failed += 1;
};

const resolution = (fingerprint: string, vehicleId: number) => ({
  provider: 'autopartsapi' as const,
  redlinedVehicleId: '',
  typeId: 1,
  manufacturerId: 74,
  modelId: 9001,
  vehicleId,
  manufacturerName: 'MERCEDES-BENZ',
  modelName: 'S-CLASS (W221)',
  modificationDescription: 'QA VARIANT — DELETE ME',
  resolutionStatus: 'resolved' as const,
  evidence: [{ step: 'cache' as const, outcome: 'matched' as const, detail: 'QA' }],
  fingerprint,
  resolvedAt: new Date().toISOString(),
});

async function main() {
  const { readMapping, writeMapping, vehicleBelongsToShop, candidateWasOffered } =
    await import('../lib/parts/vehicleResolution/mappingStore');

  console.log('\nM-PARTS2B TENANT ISOLATION');
  console.log('='.repeat(60));

  // Two shops that each own at least one vehicle.
  const { data: vehicles } = await admin
    .from('vehicles').select('id, shop_id').not('shop_id', 'is', null).limit(400);
  const byShop = new Map<string, string>();
  for (const v of (vehicles ?? []) as Array<{ id: string; shop_id: string }>) {
    if (!byShop.has(v.shop_id)) byShop.set(v.shop_id, v.id);
  }
  const shops = [...byShop.entries()];
  if (shops.length < 2) {
    console.error('Need two shops with vehicles to prove isolation.');
    process.exit(2);
  }

  const [shopA, vehicleA] = shops[0];
  const [shopB, vehicleB] = shops[1];
  console.log(`shop A ...${shopA.slice(-6)}   shop B ...${shopB.slice(-6)}\n`);

  const created: string[] = [];
  try {
    check('A writes its own mapping',
      await writeMapping({ shopId: shopA, vehicleId: vehicleA, resolution: resolution('qa-a', 5501) }));
    created.push(vehicleA);

    check('B writes its own mapping',
      await writeMapping({ shopId: shopB, vehicleId: vehicleB, resolution: resolution('qa-b', 5502) }));
    created.push(vehicleB);

    // ── Read isolation ──────────────────────────────────────────────────────
    const aReadsOwn = await readMapping(shopA, vehicleA);
    check('A reads its own mapping', aReadsOwn?.provider_vehicle_id === 5501);

    const aReadsB = await readMapping(shopA, vehicleB);
    check("A CANNOT read B's mapping", aReadsB === null);

    const bReadsA = await readMapping(shopB, vehicleA);
    check("B CANNOT read A's mapping", bReadsA === null);

    // ── Write isolation ─────────────────────────────────────────────────────
    const aWritesB = await writeMapping({
      shopId: shopA, vehicleId: vehicleB, resolution: resolution('qa-hijack', 9999),
    });
    check("A CANNOT write a mapping for B's vehicle", aWritesB === false);

    const bStillIntact = await readMapping(shopB, vehicleB);
    check("B's mapping is unchanged after A's attempt", bStillIntact?.provider_vehicle_id === 5502);

    // ── Vehicle ownership ───────────────────────────────────────────────────
    check('vehicleBelongsToShop is true for its own', await vehicleBelongsToShop(shopA, vehicleA));
    check('vehicleBelongsToShop is false across shops', !await vehicleBelongsToShop(shopA, vehicleB));

    // ── Untrusted candidate id ──────────────────────────────────────────────
    const offered = [{ vehicleId: 5501 }, { vehicleId: 5502 }];
    check('a candidate the resolver offered is accepted', candidateWasOffered(5501, offered));
    check('an id the resolver never offered is refused', !candidateWasOffered(424242, offered));
    check('a non-integer id is refused', !candidateWasOffered('5501; drop table', offered));
    check('a negative id is refused', !candidateWasOffered(-1, offered));

    // ── Usage events are shop-scoped too ────────────────────────────────────
    await admin.from('parts_provider_usage_events').insert([
      { shop_id: shopA, endpoint_category: 'reference', cache_hit: false },
      { shop_id: shopB, endpoint_category: 'reference', cache_hit: false },
    ]);
    const { data: aUsage } = await admin.from('parts_provider_usage_events')
      .select('shop_id').eq('shop_id', shopA);
    check('usage rows filter by shop',
      (aUsage ?? []).every((r: { shop_id: string }) => r.shop_id === shopA));
    await admin.from('parts_provider_usage_events')
      .delete().in('shop_id', [shopA, shopB]).eq('endpoint_category', 'reference');
  } finally {
    for (const v of created) {
      await admin.from('parts_provider_vehicle_mappings').delete().eq('vehicle_id', v);
    }
    const { data: left } = await admin.from('parts_provider_vehicle_mappings')
      .select('id').in('vehicle_id', created);
    check('QA mappings removed', (left ?? []).length === 0);
  }

  console.log('='.repeat(60));
  console.log(failed ? `\n${failed} CHECK(S) FAILED\n` : '\nALL CHECKS PASSED\n');
  process.exit(failed ? 1 : 0);
}

main().catch(e => {
  console.error('unexpected: ' + (e instanceof Error ? e.message : String(e)));
  process.exit(1);
});
