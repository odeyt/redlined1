// SI-9: Business Memory Backfill Script
// Rebuilds memory for one shop, all shops, or a specific entity.
//
// Usage:
//   npx tsx scripts/rebuild-business-memory.ts --shop-id=<uuid>
//   npx tsx scripts/rebuild-business-memory.ts --all-shops
//   npx tsx scripts/rebuild-business-memory.ts --shop-id=<uuid> --entity-type=customer --entity-id=<uuid>
//   npx tsx scripts/rebuild-business-memory.ts --shop-id=<uuid> --dry-run

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import {
  extractMemoryForShop,
  extractCustomerMemory,
  extractVehicleMemory,
  extractRevenueMemory,
  extractTechnicianMemory,
  extractPartsMemory,
} from '../intelligence/memory/BusinessMemoryEngine';

// ── Arg parsing ───────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find(a => a.startsWith(prefix));
  return arg?.slice(prefix.length);
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

// ── DB helpers ────────────────────────────────────────────────

async function getAdminDb() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local');
  return createClient(url, key);
}

async function getAllShopIds(): Promise<string[]> {
  const db = await getAdminDb();
  const { data, error } = await db.from('shops').select('id');
  if (error) throw error;
  return ((data ?? []) as Array<{ id: string }>).map(r => r.id);
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  const shopId     = getArg('shop-id');
  const allShops   = hasFlag('all-shops');
  const entityType = getArg('entity-type');
  const entityId   = getArg('entity-id');
  const dryRun     = hasFlag('dry-run');

  if (!shopId && !allShops) {
    console.error('Error: --shop-id=<uuid> or --all-shops is required');
    process.exit(1);
  }

  if (dryRun) console.log('[Memory] DRY RUN — no data will be written');

  const shopIds = allShops ? await getAllShopIds() : [shopId!];

  let totalCreated = 0, totalUpdated = 0, totalWarnings = 0;

  for (const sid of shopIds) {
    console.log(`\n[Memory] Processing shop: ${sid}`);

    let result;
    if (entityType && entityId) {
      if (entityType === 'customer') {
        result = await extractCustomerMemory(sid, entityId, dryRun);
      } else if (entityType === 'vehicle') {
        result = await extractVehicleMemory(sid, entityId, dryRun);
      } else if (entityType === 'revenue') {
        result = await extractRevenueMemory(sid, dryRun);
      } else if (entityType === 'technician') {
        result = await extractTechnicianMemory(sid, dryRun);
      } else if (entityType === 'parts') {
        result = await extractPartsMemory(sid, dryRun);
      } else {
        console.error(`Unknown entity-type: ${entityType}. Use: customer, vehicle, revenue, technician, parts`);
        process.exit(1);
      }
    } else {
      result = await extractMemoryForShop(sid, dryRun);
    }

    totalCreated  += result.itemsCreated;
    totalUpdated  += result.itemsUpdated;
    totalWarnings += result.warnings.length;

    console.log(`  Created: ${result.itemsCreated}  Updated: ${result.itemsUpdated}  Duration: ${result.durationMs}ms`);
    if (result.warnings.length > 0) {
      console.log(`  Warnings (${result.warnings.length}):`);
      for (const w of result.warnings) console.log(`    - ${w}`);
    }
  }

  console.log(`\n[Memory] Done.`);
  console.log(`  Total created: ${totalCreated}`);
  console.log(`  Total updated: ${totalUpdated}`);
  console.log(`  Total warnings: ${totalWarnings}`);
  if (dryRun) console.log('  [DRY RUN] No data was written.');
}

main().catch(err => {
  console.error('[Memory] Fatal error:', err);
  process.exit(1);
});
