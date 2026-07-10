// SI-13: Customer Lifetime Intelligence Rebuild Script
// Dry-run by default. Set REBUILD=true to persist.
// Usage: npx tsx scripts/rebuild-customer-lifetime-intelligence.ts [--shop=<shopId>] [--customer=<customerId>]

import { createClient } from '@supabase/supabase-js';
import { buildCustomerProfile } from '../intelligence/customer/CustomerLifetimeEngine';

const DRY_RUN = process.env.REBUILD !== 'true';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const args = process.argv.slice(2);
const shopArg = args.find(a => a.startsWith('--shop='))?.split('=')[1];
const customerArg = args.find(a => a.startsWith('--customer='))?.split('=')[1];

async function main() {
  console.log(`\n[SI-13] Customer Lifetime Intelligence Rebuild`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (set REBUILD=true to persist)' : 'LIVE'}\n`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Scope to specific shop if provided
  let shopIds: string[] = [];
  if (shopArg) {
    shopIds = [shopArg];
  } else {
    const { data: shops } = await supabase.from('shops').select('id').limit(50);
    shopIds = (shops ?? []).map((s: { id: string }) => s.id);
  }

  console.log(`Shops to process: ${shopIds.length}`);

  let totalProcessed = 0;
  let totalErrors = 0;

  for (const shopId of shopIds) {
    let customerQuery = supabase.from('customers').select('id').eq('shop_id', shopId).limit(500);
    if (customerArg) {
      customerQuery = supabase.from('customers').select('id').eq('shop_id', shopId).eq('id', customerArg).limit(1);
    }
    const { data: customers } = await customerQuery;
    if (!customers || customers.length === 0) continue;

    console.log(`\nShop ${shopId}: ${customers.length} customers`);

    for (const customer of customers as { id: string }[]) {
      try {
        if (DRY_RUN) {
          console.log(`  [DRY] Would rebuild: ${customer.id}`);
        } else {
          const result = await buildCustomerProfile(shopId, customer.id);
          console.log(`  ✓ ${customer.id} → ${result.profile.profileStatus} (${result.engineErrors.length} errors)`);
        }
        totalProcessed++;
      } catch (e) {
        console.error(`  ✗ ${customer.id}: ${String(e)}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n── Summary ──────────────────────────────────────`);
  console.log(`Processed: ${totalProcessed}`);
  console.log(`Errors:    ${totalErrors}`);
  console.log(`Mode:      ${DRY_RUN ? 'DRY RUN — no changes written' : 'LIVE — profiles updated'}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
