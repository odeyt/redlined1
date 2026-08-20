/**
 * Issue and revoke API v1 keys.
 *
 * The secret is printed once, here, and never stored. What goes to the
 * database is sha256 of it plus a short non-secret prefix, so a leaked
 * database yields nothing usable and an operator can still tell keys apart.
 *
 * Usage:
 *   npx tsx scripts/api-key.ts list
 *   npx tsx scripts/api-key.ts issue --org <uuid> [--shop <uuid>] --name "Xero sync" --scopes customers:read,customers:write
 *   npx tsx scripts/api-key.ts revoke --id <uuid>
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { randomBytes } from 'crypto';
import { API_KEY_PREFIX, hashApiKey } from '../lib/api/principal';
import { isApiScope, API_SCOPES } from '../lib/api/scopes';

config({ path: '.env.local' });

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const arg = (name: string) => {
  const i = process.argv.indexOf('--' + name);
  return i === -1 ? null : process.argv[i + 1];
};

async function main() {
  const command = process.argv[2];

  if (command === 'list') {
    const { data } = await db
      .from('api_keys')
      .select('id, name, organization_id, shop_id, prefix, scopes, created_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false });
    for (const k of data ?? []) {
      console.log(
        (k.revoked_at ? '[revoked] ' : '[active]  ') + k.prefix + '…  ' + k.name,
        '\n    org=' + k.organization_id, k.shop_id ? 'shop=' + k.shop_id : '(all shops in org)',
        '\n    scopes=' + JSON.stringify(k.scopes), 'last_used=' + (k.last_used_at ?? 'never'),
        '\n    id=' + k.id,
      );
    }
    if (!data?.length) console.log('No API keys.');
    return;
  }

  if (command === 'revoke') {
    const id = arg('id');
    if (!id) { console.error('--id is required'); process.exit(1); }
    const { data, error } = await db
      .from('api_keys').update({ revoked_at: new Date().toISOString() })
      .eq('id', id).is('revoked_at', null).select('id, name');
    if (error) { console.error(error.message); process.exit(1); }
    if (!data?.length) { console.error('No active key with that id.'); process.exit(1); }
    console.log('Revoked ' + data[0].name + '. It stops working immediately.');
    return;
  }

  if (command !== 'issue') {
    console.error('Commands: list | issue | revoke');
    process.exit(1);
  }

  const org = arg('org');
  const shop = arg('shop');
  const name = arg('name');
  const scopes = (arg('scopes') ?? '').split(',').map(s => s.trim()).filter(Boolean);

  if (!org || !name) { console.error('--org and --name are required'); process.exit(1); }
  if (!scopes.length) { console.error('--scopes is required. Known: ' + API_SCOPES.join(', ')); process.exit(1); }

  const unknown = scopes.filter(s => !isApiScope(s));
  if (unknown.length) { console.error('Unknown scope(s): ' + unknown.join(', ')); process.exit(1); }

  // The shop must belong to the organization. Checked here as well as at
  // request time, so a bad pairing cannot be issued in the first place.
  if (shop) {
    const { data: s } = await db.from('shops').select('id').eq('id', shop).eq('organization_id', org).maybeSingle();
    if (!s) { console.error('That shop does not belong to that organization.'); process.exit(1); }
  }

  const secret = API_KEY_PREFIX + randomBytes(24).toString('hex');
  const prefix = secret.slice(0, API_KEY_PREFIX.length + 8);

  const { data, error } = await db.from('api_keys').insert({
    organization_id: org, shop_id: shop, name, prefix,
    key_hash: hashApiKey(secret), scopes,
  }).select('id').single();

  if (error) { console.error(error.message); process.exit(1); }

  console.log('Key issued: ' + name);
  console.log('  id     : ' + data.id);
  console.log('  scopes : ' + scopes.join(', '));
  console.log('  shop   : ' + (shop ?? 'all shops in the organization'));
  console.log('\n  SECRET (shown once, store it now):\n\n    ' + secret + '\n');
}

main().catch(err => { console.error(err); process.exit(1); });
