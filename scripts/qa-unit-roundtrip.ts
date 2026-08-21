/**
 * Proves that a line item's `unit` survives a real database round trip.
 *
 * The claim being tested is that `line_items` is JSONB, the item object is
 * written and read back verbatim, and therefore `unit` needs no migration.
 * That is an easy thing to assert and a cheap thing to be wrong about — a
 * mapper that rebuilds the item field by field would silently drop it, and
 * nothing in a unit test would notice because the unit test does not go
 * through PostgREST.
 *
 * So this writes a real row, reads it back through the same service the app
 * uses, edits it, reads it again, and deletes it.
 *
 * Safety:
 *   - refuses to run against any project but Redlined1
 *   - creates ONE quotation, clearly marked QA, and removes it
 *   - touches no existing record
 *   - prints no secrets
 *
 *   npx tsx scripts/qa-unit-roundtrip.ts
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const EXPECTED_PROJECT_REF = 'ldjrlvjkmzrcdqhetqoh';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

function fail(msg: string): never {
  console.error('FAIL: ' + msg);
  process.exit(2);
}

const ref = (url.match(/https:\/\/([a-z0-9]+)\.supabase\.co/) ?? [])[1];
if (!url || !key) fail('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
if (ref !== EXPECTED_PROJECT_REF) {
  fail(`Refusing to run: expected the Redlined1 project (${EXPECTED_PROJECT_REF}), got "${ref}".`);
}

const db = createClient(url, key, { auth: { persistSession: false } });

type Item = {
  partName: string; partNumber: string; condition: string;
  quantity: number; unitCost: number; unit?: string; currency?: string;
};

const check = (label: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail === undefined ? '' : ' -> ' + JSON.stringify(detail)}`);
  if (!ok) process.exitCode = 1;
};

async function main() {
  // A real shop, so the row is valid — but the row itself is ours and is deleted.
  const { data: shop } = await db.from('shops').select('id, name').limit(1).single();
  if (!shop) fail('no shop found');
  console.log(`shop: ${shop.name}\n`);

  const created: Item[] = [
    { partName: 'QA UNIT TEST — DELETE ME', partNumber: 'QA-UNIT-1', condition: 'New', quantity: 4, unitCost: 50, unit: 'Qt', currency: 'THB' },
    // deliberately WITHOUT `unit`, standing in for every pre-existing row
    { partName: 'QA LEGACY LINE — DELETE ME', partNumber: 'QA-UNIT-2', condition: 'New', quantity: 2, unitCost: 10, currency: 'THB' },
  ];

  const { data: ins, error: insErr } = await db.from('parts_estimates').insert({
    shop_id: shop.id,
    part_name: 'QA UNIT TEST — DELETE ME',
    part_number: 'QA-UNIT-1',
    condition: 'New',
    quantity: 6,
    unit_cost: 50,
    total_cost: 220,
    status: 'Draft',
    currency: 'THB',
    line_items: created,
    notes: 'Automated QA row for the unit round-trip proof. Safe to delete.',
  }).select('id, line_items').single();

  if (insErr) fail('insert: ' + insErr.message);
  const id = ins!.id as string;
  console.log(`created ${id}\n--- write ---`);

  try {
    // 1. Read it back through a fresh query, not from the insert's return.
    const { data: read1 } = await db.from('parts_estimates').select('line_items').eq('id', id).single();
    const back = read1!.line_items as Item[];

    check('line_items is an array of objects, not a string', Array.isArray(back), typeof read1!.line_items);
    check('two lines came back', back.length === 2);
    check('quantity survived as a NUMBER', back[0].quantity === 4 && typeof back[0].quantity === 'number', back[0].quantity);
    check('unit survived', back[0].unit === 'Qt', back[0].unit);
    // By value, not by serialised string: Postgres `jsonb` normalises and does
    // NOT preserve key order, so a string comparison fails on a row that is
    // byte-for-byte correct. (`json` would preserve it; the column is `jsonb`.)
    const sameKeys = (a: object, b: object) =>
      JSON.stringify(Object.keys(a).sort()) === JSON.stringify(Object.keys(b).sort());
    const sameValues = (a: Record<string, unknown>, b: Record<string, unknown>) =>
      Object.keys(a).every(k => a[k] === b[k]);
    check('no key was added, renamed or dropped',
      sameKeys(back[0], created[0]) && sameValues(back[0] as Record<string, unknown>, created[0] as unknown as Record<string, unknown>),
      { got: Object.keys(back[0]).sort(), want: Object.keys(created[0]).sort() });
    check('the legacy line has NO unit key at all', !('unit' in back[1]), Object.keys(back[1]));
    check('the legacy line is otherwise intact', back[1].quantity === 2 && back[1].partNumber === 'QA-UNIT-2');

    // 2. Edit 4 Qt -> 2 L, exactly as the form would.
    const edited = back.map((i, n) => (n === 0 ? { ...i, quantity: 2, unit: 'L' } : i));
    const { error: updErr } = await db.from('parts_estimates').update({ line_items: edited }).eq('id', id);
    if (updErr) fail('update: ' + updErr.message);

    const { data: read2 } = await db.from('parts_estimates').select('line_items').eq('id', id).single();
    const back2 = read2!.line_items as Item[];
    console.log('--- edit 4 Qt -> 2 L ---');
    check('quantity is now 2', back2[0].quantity === 2, back2[0].quantity);
    check('unit is now L', back2[0].unit === 'L', back2[0].unit);
    check('the untouched legacy line still has no unit', !('unit' in back2[1]));

    // 3. A malformed unit must round-trip rather than break the row.
    const malformed = back2.map((i, n) => (n === 0 ? { ...i, unit: 'ZZZ-not-a-unit' } : i));
    await db.from('parts_estimates').update({ line_items: malformed }).eq('id', id);
    const { data: read3 } = await db.from('parts_estimates').select('line_items').eq('id', id).single();
    console.log('--- malformed unit ---');
    check('stored verbatim, no coercion, no error',
      (read3!.line_items as Item[])[0].unit === 'ZZZ-not-a-unit');
  } finally {
    const { error: delErr } = await db.from('parts_estimates').delete().eq('id', id);
    console.log(`\ncleanup: ${delErr ? 'FAILED — ' + delErr.message : 'deleted ' + id}`);
    if (delErr) process.exitCode = 1;
    const { data: gone } = await db.from('parts_estimates').select('id').eq('id', id).maybeSingle();
    check('QA row is gone', !gone);
  }
}

main().catch(e => fail(String(e)));
