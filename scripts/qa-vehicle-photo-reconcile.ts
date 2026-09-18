/**
 * A read-only census of every vehicle photo reference in the database.
 *
 * Writes NOTHING. It reads `vehicle_images`, `vehicles`, and lists storage
 * folders. No upload, no update, no delete, no migration. Run it before any
 * change to the photo model, and again afterwards, and compare the counts.
 *
 * ## What it is for
 *
 * "The photos disappear" is three different failures wearing one coat: a row
 * with no reference at all, a reference that cannot be turned into a storage
 * key, a key whose object is gone, and a key the storage policy will refuse.
 * They need different fixes and some of them are not bugs. This classifies
 * every row into exactly one of:
 *
 *   ok                — canonical key, object present, policy-resolvable
 *   no_reference      — the row stores nothing
 *   legacy_signed_url — an EXPIRING signed URL was persisted (must be rewritten)
 *   object_missing    — well-formed key, no such object in the bucket
 *   invalid_path      — not identifiable as an object in this project's bucket
 *   access_denied     — key resolves to a vehicle that cannot authorize it
 *
 * ## No PII, no secrets
 *
 * Never prints a customer name, VIN, plate, file URL, signed token or key.
 * Rows are identified by vehicle UUID and the bucket-relative object path
 * only, and only under --detail. The default output is counts.
 *
 *   npx tsx scripts/qa-vehicle-photo-reconcile.ts
 *   npx tsx scripts/qa-vehicle-photo-reconcile.ts --detail
 *   npx tsx scripts/qa-vehicle-photo-reconcile.ts --no-object-check
 *   npx tsx scripts/qa-vehicle-photo-reconcile.ts --json
 */
import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
  parseVehiclePhotoRef,
  validateVehicleObjectPath,
  projectHostFromUrl,
  SHOP_ASSETS_BUCKET,
  VEHICLE_PREFIX,
} from '../lib/storage/vehiclePhotoRef';

config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
if (!/ldjrlvjkmzrcdqhetqoh/.test(url)) {
  console.error('Refusing to run: expected the Redlined1 project.');
  process.exit(2);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!serviceKey) {
  console.error('Refusing to run: SUPABASE_SERVICE_ROLE_KEY is not set.');
  process.exit(2);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
const projectHost = projectHostFromUrl(url);

const DETAIL = process.argv.includes('--detail');
const JSON_OUT = process.argv.includes('--json');
const CHECK_OBJECTS = !process.argv.includes('--no-object-check');

type Status =
  | 'ok'
  | 'no_reference'
  | 'legacy_signed_url'
  | 'object_missing'
  | 'invalid_path'
  | 'access_denied';

const STATUSES: Status[] = [
  'ok', 'no_reference', 'legacy_signed_url', 'object_missing', 'invalid_path', 'access_denied',
];

interface Finding {
  vehicleId: string;
  status: Status;
  /** Bucket-relative key, or '' when none could be derived. Safe to print. */
  path: string;
  reason?: string;
}

/**
 * Lists one vehicle's folder once and caches it.
 *
 * Supabase storage has no cheap "does this key exist"; `list()` on the parent
 * is the closest thing. One call per vehicle that has photos — a few hundred
 * on this fleet — and the result is reused for every photo of that vehicle.
 */
const folderCache = new Map<string, Set<string> | null>();

async function folderContents(vehicleId: string): Promise<Set<string> | null> {
  const cached = folderCache.get(vehicleId);
  if (cached !== undefined) return cached;

  const names = new Set<string>();
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage
      .from(SHOP_ASSETS_BUCKET)
      .list(`${VEHICLE_PREFIX}/${vehicleId}`, { limit: 100, offset });
    if (error) {
      // A listing failure is not evidence the object is gone. Cache null so
      // every photo of this vehicle is reported as unchecked rather than
      // wrongly reported as missing.
      folderCache.set(vehicleId, null);
      return null;
    }
    for (const entry of data ?? []) names.add(entry.name);
    if (!data || data.length < 100) break;
    offset += data.length;
  }
  folderCache.set(vehicleId, names);
  return names;
}

async function main() {
  // ---- vehicles, for the ownership resolution the storage policy performs --
  const vehicleShop = new Map<string, string | null>();
  {
    let from = 0;
    const page = 1000;
    while (true) {
      const { data, error } = await admin
        .from('vehicles')
        .select('id, shop_id')
        .range(from, from + page - 1);
      if (error) throw new Error(`reading vehicles: ${error.message}`);
      for (const v of data ?? []) vehicleShop.set(v.id as string, (v.shop_id as string) ?? null);
      if (!data || data.length < page) break;
      from += page;
    }
  }

  // ---- every photo row ----------------------------------------------------
  interface Row { id: string; vehicle_id: string; url: string | null }
  const rows: Row[] = [];
  {
    let from = 0;
    const page = 1000;
    while (true) {
      const { data, error } = await admin
        .from('vehicle_images')
        .select('id, vehicle_id, url')
        .range(from, from + page - 1);
      if (error) throw new Error(`reading vehicle_images: ${error.message}`);
      rows.push(...((data ?? []) as Row[]));
      if (!data || data.length < page) break;
      from += page;
    }
  }

  const findings: Finding[] = [];
  let uncheckedObjects = 0;

  for (const row of rows) {
    const vehicleId = row.vehicle_id;
    const parsed = parseVehiclePhotoRef(row.url, { projectHost });

    if (parsed.kind === 'none') {
      findings.push({ vehicleId, status: 'no_reference', path: '' });
      continue;
    }

    // Reported ahead of every other defect: a persisted signed URL is the one
    // class that is guaranteed to stop working on a clock, so it is the one
    // the migration must rewrite even if the key inside it is otherwise fine.
    if (parsed.kind === 'signed_url') {
      findings.push({
        vehicleId,
        status: 'legacy_signed_url',
        path: parsed.path ?? '',
        reason: parsed.path ? undefined : parsed.reason,
      });
      continue;
    }

    if (!parsed.path) {
      findings.push({ vehicleId, status: 'invalid_path', path: '', reason: parsed.reason });
      continue;
    }

    const shape = validateVehicleObjectPath(parsed.path);
    if (!shape.valid) {
      findings.push({ vehicleId, status: 'invalid_path', path: parsed.path, reason: shape.reason });
      continue;
    }

    // can_read_shop_asset() reads the vehicle id out of the PATH and looks
    // that vehicle up. A key naming a vehicle that is gone, or a vehicle
    // other than the row's own, is denied to the people who should see it.
    const pathVehicleId = parsed.vehicleId!;
    if (!vehicleShop.has(pathVehicleId)) {
      findings.push({ vehicleId, status: 'access_denied', path: parsed.path, reason: 'path names a vehicle that no longer exists' });
      continue;
    }
    if (pathVehicleId.toLowerCase() !== vehicleId.toLowerCase()) {
      findings.push({ vehicleId, status: 'access_denied', path: parsed.path, reason: 'path names a different vehicle than the row' });
      continue;
    }

    if (!CHECK_OBJECTS) {
      findings.push({ vehicleId, status: 'ok', path: parsed.path });
      continue;
    }

    const contents = await folderContents(pathVehicleId);
    if (contents === null) {
      uncheckedObjects++;
      findings.push({ vehicleId, status: 'ok', path: parsed.path, reason: 'object existence not checked (listing failed)' });
      continue;
    }
    const fileName = parsed.path.split('/').slice(2).join('/');
    findings.push(
      contents.has(fileName)
        ? { vehicleId, status: 'ok', path: parsed.path }
        : { vehicleId, status: 'object_missing', path: parsed.path },
    );
  }

  const counts = Object.fromEntries(STATUSES.map(s => [s, 0])) as Record<Status, number>;
  for (const f of findings) counts[f.status]++;

  const vehiclesWithPhotos = new Set(rows.map(r => r.vehicle_id)).size;
  const vehiclesWithoutPhotos = vehicleShop.size - vehiclesWithPhotos;

  if (JSON_OUT) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      photoRows: findings.length,
      vehicles: vehicleShop.size,
      vehiclesWithPhotos,
      vehiclesWithoutPhotos,
      objectCheck: CHECK_OBJECTS,
      uncheckedObjects,
      counts,
      ...(DETAIL ? { findings } : {}),
    }, null, 2));
    return;
  }

  console.log('');
  console.log('Vehicle photo reconciliation — READ ONLY');
  console.log('========================================');
  console.log(`vehicles                 ${String(vehicleShop.size).padStart(6)}`);
  console.log(`  with photo rows        ${String(vehiclesWithPhotos).padStart(6)}`);
  console.log(`  without photo rows     ${String(vehiclesWithoutPhotos).padStart(6)}   (normal placeholder)`);
  console.log(`photo rows               ${String(findings.length).padStart(6)}`);
  console.log('');
  for (const s of STATUSES) {
    const n = counts[s];
    const pct = findings.length ? `${Math.round((n / findings.length) * 100)}%` : '—';
    console.log(`  ${s.padEnd(20)} ${String(n).padStart(6)}   ${pct.padStart(4)}`);
  }
  if (!CHECK_OBJECTS) console.log('\n  (object existence not checked: --no-object-check)');
  else if (uncheckedObjects) console.log(`\n  (${uncheckedObjects} rows counted ok without an object check: folder listing failed)`);

  if (DETAIL) {
    console.log('\nRows needing attention (vehicle uuid + object path only):');
    const attention = findings.filter(f => f.status !== 'ok');
    if (attention.length === 0) console.log('  none');
    for (const f of attention) {
      console.log(`  ${f.vehicleId}  ${f.status.padEnd(18)} ${f.path || '—'}${f.reason ? `  (${f.reason})` : ''}`);
    }
  }
  console.log('');
}

main().catch(err => {
  console.error('[vehicle-photo-reconcile]', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
