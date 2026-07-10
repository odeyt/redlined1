#!/usr/bin/env tsx
// SI-10: Rebuild vehicle intelligence profiles
// Usage:
//   npx tsx scripts/rebuild-vehicle-intelligence.ts --shop-id <id>
//   npx tsx scripts/rebuild-vehicle-intelligence.ts --all-shops
//   npx tsx scripts/rebuild-vehicle-intelligence.ts --shop-id <id> --vehicle-id <id>
//   npx tsx scripts/rebuild-vehicle-intelligence.ts --shop-id <id> --dry-run

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const args = process.argv.slice(2);
const argMap: Record<string, string> = {};
for (let i = 0; i < args.length; i += 2) {
  argMap[args[i].replace(/^--/, '')] = args[i + 1] ?? 'true';
}

const shopId    = argMap['shop-id']    ?? null;
const vehicleId = argMap['vehicle-id'] ?? null;
const allShops  = argMap['all-shops']  === 'true';
const dryRun    = argMap['dry-run']    === 'true';

async function getDb() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function rebuildShop(db: Awaited<ReturnType<typeof getDb>>, sid: string): Promise<void> {
  const { buildVehicleIntelligence } = await import('../intelligence/vehicle/VehicleIntelligenceEngine');

  // Get all vehicles for this shop
  const { data: vehicles } = await db
    .from('vehicles')
    .select('id')
    .eq('shop_id', sid);

  if (!vehicles?.length) {
    console.log(`  [shop ${sid}] No vehicles found.`);
    return;
  }

  console.log(`  [shop ${sid}] Rebuilding ${vehicles.length} vehicle(s)…`);
  let success = 0; let failed = 0;

  for (const v of vehicles as Array<{ id: string }>) {
    try {
      const result = await buildVehicleIntelligence(sid, v.id, dryRun);
      success++;
      if (result.warnings.length > 0) {
        console.log(`    ⚠ ${v.id}: ${result.warnings.join('; ')}`);
      }
    } catch (e) {
      failed++;
      console.error(`    ✗ ${v.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`  [shop ${sid}] Done — ${success} rebuilt, ${failed} failed${dryRun ? ' (dry run)' : ''}`);
}

async function main() {
  if (!shopId && !allShops) {
    console.error('Usage: --shop-id <id> | --all-shops [--vehicle-id <id>] [--dry-run]');
    process.exit(1);
  }

  const db = await getDb();

  if (vehicleId && shopId) {
    // Single vehicle
    const { buildVehicleIntelligence } = await import('../intelligence/vehicle/VehicleIntelligenceEngine');
    console.log(`Rebuilding vehicle ${vehicleId} in shop ${shopId}${dryRun ? ' (dry run)' : ''}…`);
    const result = await buildVehicleIntelligence(shopId, vehicleId, dryRun);
    console.log(`Done — health: ${result.profile.healthScore ?? 'n/a'}, status: ${result.profile.intelligenceStatus}, duration: ${result.durationMs}ms`);
    if (result.warnings.length > 0) console.log('Warnings:', result.warnings);
    return;
  }

  if (allShops) {
    const { data: shops } = await db.from('shops').select('id');
    if (!shops?.length) { console.log('No shops found.'); return; }
    for (const s of shops as Array<{ id: string }>) {
      await rebuildShop(db, s.id);
    }
    return;
  }

  if (shopId) {
    await rebuildShop(db, shopId);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
