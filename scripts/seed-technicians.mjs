/**
 * seed-technicians.mjs
 * Inserts the D1 team roster into BOTH shops (shop 1 + shop 2).
 *
 * Usage:
 *   node scripts/seed-technicians.mjs <email> <password>
 *
 * It will:
 *   1. Sign in to Supabase as you
 *   2. Resolve the UUID for each shop (by slug)
 *   3. Insert all technicians — skips any whose (shop_id + name) already exists
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = 'https://ldjrlvjkmzrcdqhetqoh.supabase.co';
const SUPABASE_ANON = 'sb_publishable_lKnlzbdgw2xAAzIDPOhAxQ_KlXw3Q8h';

const SHOP_SLUGS = ['d1-imports', 'd1-imports-location-2'];

// ── Roster ─────────────────────────────────────────────────────────────────
// Columns that map to the 'technicians' table:
//   name, role, status  (all other fields left at default / blank)
const ROSTER = [
  { name: 'Wally',  role: 'Owner'          },
  { name: 'Aeng',   role: 'Shop Manager'   },
  { name: 'Beck',   role: 'Master Mechanic' },
  { name: 'Kat',    role: 'Master Mechanic' },
  { name: 'Kevin',  role: 'Master Mechanic' },
  { name: 'Noy',    role: 'Mechanic'       },
  { name: 'Gae',    role: 'Mechanic'       },
  { name: 'John',   role: 'Mechanic'       },
  { name: 'Don',    role: 'Mechanic'       },
  { name: 'Biggie', role: 'Parts Runner'   },
  { name: 'Peter',  role: 'Office Manager' },
];

// ── Main ───────────────────────────────────────────────────────────────────
const [,, email, password] = process.argv;
if (!email || !password) {
  console.error('Usage: node scripts/seed-technicians.mjs <email> <password>');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

console.log(`\nSigning in as ${email}…`);
const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr) { console.error('Auth failed:', authErr.message); process.exit(1); }
console.log('✓ Signed in.\n');

// Resolve shop IDs
const { data: shops, error: shopsErr } = await supabase
  .from('shops')
  .select('id, name, slug')
  .in('slug', SHOP_SLUGS);

if (shopsErr) { console.error('Could not fetch shops:', shopsErr.message); process.exit(1); }
if (!shops || shops.length === 0) { console.error('No shops found — have you run the multi-tenant migration?'); process.exit(1); }

console.log('Shops found:');
shops.forEach(s => console.log(`  ${s.name}  →  ${s.id}`));
console.log();

// Fetch already-existing technicians to avoid duplicates
const shopIds = shops.map(s => s.id);
const { data: existing } = await supabase
  .from('technicians')
  .select('shop_id, name')
  .in('shop_id', shopIds);

const existingSet = new Set((existing ?? []).map(r => `${r.shop_id}::${r.name}`));

// Build insert rows
const rows = [];
for (const shop of shops) {
  for (const tech of ROSTER) {
    const key = `${shop.id}::${tech.name}`;
    if (existingSet.has(key)) {
      console.log(`  skip  ${tech.name} @ ${shop.name} (already exists)`);
      continue;
    }
    rows.push({
      shop_id: shop.id,
      name:    tech.name,
      role:    tech.role,
      status:  'Active',
      pay_type: 'Hourly',
      pay_rate: 25,
      phone:   '',
      email:   '',
      specialty: '',
      certifications: '',
      notes:   '',
    });
  }
}

if (rows.length === 0) {
  console.log('Nothing to insert — all technicians already exist in both shops.');
  process.exit(0);
}

console.log(`\nInserting ${rows.length} technician record(s)…`);
const { error: insertErr } = await supabase.from('technicians').insert(rows);
if (insertErr) {
  console.error('Insert failed:', insertErr.message);
  process.exit(1);
}

console.log(`\n✓ Done! ${rows.length} technician(s) added.\n`);
console.log('Breakdown by shop:');
for (const shop of shops) {
  const count = rows.filter(r => r.shop_id === shop.id).length;
  console.log(`  ${shop.name}: ${count} added`);
}
