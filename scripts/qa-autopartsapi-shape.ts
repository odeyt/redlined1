/**
 * Inspect the LIVE response shape — keys and types only.
 *
 * Run once, when the normaliser disagrees with reality. It prints field names,
 * value types and short redacted samples; never a full payload, and never the
 * key. Two calls total.
 *
 *   npx tsx --conditions=react-server scripts/qa-autopartsapi-shape.ts
 */
import { config } from 'dotenv';
import { autoPartsApiRequest, hasCredentials } from '../lib/parts/providers/autopartsapi/client';
import { SEARCH_BY_OEM, searchByOemQuery, LANGUAGES_LIST } from '../lib/parts/providers/autopartsapi/endpoints';

config({ path: '.env.local' });

/** A value described, not reproduced. Long strings are truncated hard. */
function describe(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    return `array(${v.length})` + (v.length && typeof v[0] === 'object' && v[0] !== null
      ? ` of {${Object.keys(v[0] as object).slice(0, 12).join(',')}}`
      : v.length ? ` of ${typeof v[0]}` : '');
  }
  if (typeof v === 'object') return `object{${Object.keys(v as object).slice(0, 12).join(',')}}`;
  if (typeof v === 'string') return `string("${v.slice(0, 40)}${v.length > 40 ? '…' : ''}")`;
  return `${typeof v}(${String(v).slice(0, 20)})`;
}

function dumpRow(label: string, row: Record<string, unknown>) {
  console.log(`\n  ${label}`);
  for (const [k, v] of Object.entries(row).slice(0, 40)) {
    console.log(`    ${k.padEnd(28)} ${describe(v)}`);
  }
}

function rowsOf(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  for (const key of ['data', 'items', 'articles', 'result', 'results']) {
    const v = (payload as Record<string, unknown>)?.[key];
    if (Array.isArray(v)) return v as Record<string, unknown>[];
  }
  return [];
}

async function main() {
  if (!hasCredentials()) { console.error('AUTOPARTS_API_KEY: MISSING'); process.exit(2); }

  console.log('\nLIVE SHAPE INSPECTION (keys and types only)');
  console.log('='.repeat(64));

  // 1. languages/list
  const langs = await autoPartsApiRequest<unknown>(LANGUAGES_LIST);
  console.log(`\n/${LANGUAGES_LIST}`);
  console.log(`  envelope: ${describe(langs)}`);
  const langRows = rowsOf(langs);
  console.log(`  rows: ${langRows.length}`);
  if (langRows[0]) dumpRow('first row:', langRows[0]);
  // Which row looks like English, whatever the field is called.
  const englishish = langRows.find(r =>
    JSON.stringify(r).toLowerCase().includes('english'));
  if (englishish) dumpRow('row containing "english":', englishish);

  // 2. one OEM search
  const oem = process.env.AUTOPARTS_TEST_OEM?.trim() || '04465-0K340';
  const search = await autoPartsApiRequest<unknown>(SEARCH_BY_OEM, searchByOemQuery(oem));
  console.log(`\n/${SEARCH_BY_OEM}?langId=4&articleOemNo=${oem}`);
  console.log(`  envelope: ${describe(search)}`);
  const rows = rowsOf(search);
  console.log(`  rows: ${rows.length}`);
  if (rows[0]) dumpRow('first article:', rows[0]);
  if (rows[1]) dumpRow('second article:', rows[1]);

  console.log('\n' + '='.repeat(64));
  console.log('No full payload printed. No secret printed.\n');
}

main().catch(e => { console.error('failed: ' + (e as Error).message); process.exitCode = 1; });
