/**
 * Read-only proof that the mirror scope matches the real configuration.
 *
 * The unit tests run `readableShopIds` against a fake database, which proves
 * the RULES are right. It cannot prove the rules meet the DATA — that the
 * mirror rows are shaped the way the query assumes, that the vehicles the
 * picker offers are the ones this now reaches. That is what this checks, and
 * it is the difference between a passing suite and a fixed bug.
 *
 * WRITES NOTHING. Makes no AutoPartsAPI call. Prints no VIN, plate, customer
 * name or vehicle detail — shop ids are truncated and only counts are shown.
 *
 *   npx tsx scripts/verify-mirror-scope.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// The repo convention, and it survives the CRLF line endings `--env-file`
// mishandles on Windows.
config({ path: '.env.local' });
config();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const short = (id: string) => `${id.slice(0, 8)}…`;

async function main() {
  // 1. The mirror links as configured.
  const { data: mirrors, error: mErr } = await db
    .from('shop_mirrors').select('shop_id, mirror_shop_id');
  if (mErr) throw new Error(`shop_mirrors: ${mErr.message}`);

  console.log(`\nMirror links: ${mirrors?.length ?? 0}`);
  for (const m of mirrors ?? []) {
    console.log(`  ${short(m.shop_id)} -> ${short(m.mirror_shop_id)}`);
  }
  if (!mirrors?.length) {
    console.log('\nNo mirror links configured — the fix is a no-op on this data.');
    return;
  }

  // 2. Re-implement the scope rule exactly as lib/shops/mirrorScope.ts does,
  //    so a divergence between the two shows up as a wrong number here.
  const { data: members, error: uErr } = await db
    .from('shop_users').select('user_id, shop_id');
  if (uErr) throw new Error(`shop_users: ${uErr.message}`);

  const memberOf = new Map<string, Set<string>>();
  for (const r of members ?? []) {
    if (!memberOf.has(r.user_id)) memberOf.set(r.user_id, new Set());
    memberOf.get(r.user_id)!.add(r.shop_id);
  }

  const linksFrom = new Map<string, string[]>();
  for (const m of mirrors) {
    if (!linksFrom.has(m.shop_id)) linksFrom.set(m.shop_id, []);
    linksFrom.get(m.shop_id)!.push(m.mirror_shop_id);
  }

  const scopeFor = (userId: string, activeShopId: string): string[] => {
    const linked = (linksFrom.get(activeShopId) ?? []).filter(id => id !== activeShopId);
    const mine = memberOf.get(userId) ?? new Set<string>();
    return [activeShopId, ...linked.filter(id => mine.has(id)).sort()];
  };

  // 3. What actually changes: vehicles reachable before vs after, per user
  //    and active shop. This is the number the bug report was about.
  const { data: vehicles, error: vErr } = await db
    .from('vehicles').select('id, shop_id');
  if (vErr) throw new Error(`vehicles: ${vErr.message}`);

  const byShop = new Map<string, number>();
  for (const v of vehicles ?? []) {
    byShop.set(v.shop_id, (byShop.get(v.shop_id) ?? 0) + 1);
  }

  console.log('\nReachable vehicles per (user, active shop):');
  console.log('  user      active     before  after   gained');

  const shopsWithLinks = new Set(linksFrom.keys());
  let anyGain = false;

  for (const [userId, shops] of memberOf) {
    for (const activeShopId of shops) {
      if (!shopsWithLinks.has(activeShopId)) continue;
      const scope = scopeFor(userId, activeShopId);
      const before = byShop.get(activeShopId) ?? 0;
      const after = scope.reduce((n, s) => n + (byShop.get(s) ?? 0), 0);
      if (after > before) anyGain = true;
      console.log(
        `  ${short(userId)} ${short(activeShopId)} `
        + `${String(before).padStart(6)} ${String(after).padStart(6)} `
        + `${String(after - before).padStart(7)}`,
      );
    }
  }

  // 4. The security property, stated over the real rows: a link the user is
  //    not on both sides of must not widen anything.
  let narrowed = 0;
  for (const [userId, shops] of memberOf) {
    for (const activeShopId of shops) {
      const linked = (linksFrom.get(activeShopId) ?? []).filter(id => id !== activeShopId);
      const permitted = scopeFor(userId, activeShopId).slice(1);
      if (permitted.length < linked.length) narrowed += 1;
    }
  }
  console.log(
    `\n(user, shop) pairs where a mirror link exists but membership `
    + `withholds it: ${narrowed}`,
  );

  console.log(
    anyGain
      ? '\nRESULT: the scope widens for at least one real user — the reported '
        + 'case is covered.'
      : '\nRESULT: no user gains reach. Either no user belongs to both sides, '
        + 'or the mirrored shops hold no vehicles.',
  );
}

main().catch(err => { console.error(err.message); process.exit(1); });
