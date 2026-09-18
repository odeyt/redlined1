/**
 * Who can see a vehicle photo, and what a shop transfer does to that.
 *
 * Tenant isolation for vehicle photos is not enforced in TypeScript. It is
 * enforced by can_read_shop_asset(), which reads the vehicle id out of the
 * STORAGE PATH and resolves it through public.vehicles to a shop. Two
 * consequences follow, and both are load-bearing:
 *
 *   - A member of another shop cannot sign `vehicles/<id>/…` at all, because
 *     the lookup finds a vehicle whose shop_id is not theirs. There is no
 *     application code involved, so there is no application code to get wrong.
 *   - Moving a vehicle to another shop moves its photos with it automatically:
 *     the path still names the same vehicle, and that vehicle now resolves to
 *     the new shop. Nothing has to copy, rename or re-key an object — which is
 *     the only version of this that cannot lose a file halfway through.
 *
 * So the assertions here are about the shape of the policy and about what the
 * transfer path does NOT do. The live cross-tenant proof (a real signed URL,
 * refused for a real second shop) is tests/local/storage-signing.spec.ts.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
// Normalized to LF: these files are read from disk with their real line
// endings (CRLF on a Windows checkout), and the slicing below looks for a
// literal "\n}\n" to find where a function body ends.
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n');

const POLICY = read('supabase/migrations/2026-09-09_shop_assets_fix_upload_denied_by_entity_images_check.sql');
// Everything above the file's commented-out previous definition.
const LIVE_POLICY = POLICY.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');

describe('the policy that isolates vehicle photos', () => {
  it('resolves a vehicles/ path through the vehicles table to the caller\'s shop', () => {
    expect(LIVE_POLICY).toMatch(/prefix from parts\) = 'vehicles'/);
    expect(LIVE_POLICY).toMatch(/from public\.vehicles v/);
    expect(LIVE_POLICY).toMatch(/v\.shop_id::text in \(select shop_id from mine\)/);
  });

  it('resolves the caller\'s shops from their own membership rows', () => {
    expect(LIVE_POLICY).toMatch(/from public\.shop_users where user_id = auth\.uid\(\)/);
  });

  it('denies any prefix it does not recognise', () => {
    expect(LIVE_POLICY).toMatch(/else false/);
  });
});

describe('transferring a vehicle between shops', () => {
  const service = read('services/vehicleService.ts');
  const transfer = service.slice(service.indexOf('export async function transferVehicle'));
  const body = transfer.slice(0, transfer.indexOf('\n}\n') + 2);

  it('changes the vehicle row and nothing else', () => {
    expect(body).toMatch(/\.from\('vehicles'\)/);
    expect(body).toMatch(/shop_id:\s*targetShopId/);
  });

  it('never touches storage', () => {
    expect(body).not.toMatch(/storage/);
    expect(body).not.toMatch(/remove\(/);
  });

  it('never touches the photo rows, so no photo reference can be lost', () => {
    expect(body).not.toMatch(/vehicle_images/);
    expect(body).not.toMatch(/storage_path/);
  });
});

describe('the photo service never deletes broadly', () => {
  const svc = read('services/vehicleImageService.ts');

  it('has exactly one call to storage remove()', () => {
    expect(svc.match(/\.remove\(/g) ?? []).toHaveLength(1);
  });

  it('validates the key against its vehicle before removing it', () => {
    const fn = svc.slice(svc.indexOf('async function removeExactObject'));
    const body = fn.slice(0, fn.indexOf('\n}\n') + 2);
    expect(body).toMatch(/validateVehicleObjectPath\(path, vehicleId\)/);
    expect(body.indexOf('validateVehicleObjectPath')).toBeLessThan(body.indexOf('.remove('));
  });

  it('removes one exact key, never a prefix or a list built elsewhere', () => {
    expect(svc).toMatch(/\.remove\(\[path\]\)/);
    expect(svc).not.toMatch(/\.list\(/);
  });
});

describe('the migration', () => {
  const sql = read('supabase/migrations/2026-09-18_vehicle_images_storage_path.sql');

  it('contains no deletion of any kind', () => {
    const live = sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
    expect(live).not.toMatch(/\bDELETE\b/i);
    expect(live).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(live).not.toMatch(/storage\.objects/i);
  });

  it('never rewrites the legacy url column', () => {
    const live = sql.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');
    expect(live).not.toMatch(/SET\s+url\s*=/i);
  });

  it('is idempotent at every writing step', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS storage_path/);
    expect(sql).toMatch(/WHERE storage_path IS NULL/);
  });

  it('documents a reversal that loses nothing', () => {
    expect(sql).toMatch(/DROP COLUMN IF EXISTS storage_path/);
  });
});

describe('the reconciliation script', () => {
  const script = read('scripts/qa-vehicle-photo-reconcile.ts');

  it('writes nothing', () => {
    expect(script).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.remove\(|\.upload\(/);
  });

  it('reports every class the audit asked for', () => {
    for (const s of ['ok', 'no_reference', 'legacy_signed_url', 'object_missing', 'invalid_path', 'access_denied']) {
      expect(script).toContain(`'${s}'`);
    }
  });

  it('never prints a url, a token, a name, a VIN or a plate', () => {
    const printed = script.split('\n').filter(l => /console\.log/.test(l)).join('\n');
    expect(printed).not.toMatch(/\burl\b/);
    expect(printed).not.toMatch(/token/i);
    expect(printed).not.toMatch(/\bvin\b/i);
    expect(printed).not.toMatch(/plate|customer|name/i);
    expect(printed).not.toMatch(/SERVICE_ROLE/);
  });

  it('refuses to run against a project other than redlined1', () => {
    expect(script).toMatch(/Refusing to run/);
  });
});
