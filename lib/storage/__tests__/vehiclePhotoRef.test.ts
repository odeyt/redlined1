/**
 * The strict parse is a migration primitive, so its job is refusing things.
 *
 * A backfill reads whatever is in `vehicle_images.url`, including values
 * written by code nobody remembers and — once anything other than this app can
 * write that column — values chosen by someone else. A key derived from such a
 * value is a key this app would later sign, and remove(). So every rejection
 * below is a rule, not a nicety.
 */
import {
  parseVehiclePhotoRef,
  validateVehicleObjectPath,
  canonicalVehicleObjectPath,
  projectHostFromUrl,
} from '../vehiclePhotoRef';

const HOST = 'ldjrlvjkmzrcdqhetqoh.supabase.co';
const V = '11111111-2222-3333-4444-555555555555';
const PUBLIC = `https://${HOST}/storage/v1/object/public/shop-assets/`;
const SIGN = `https://${HOST}/storage/v1/object/sign/shop-assets/`;

describe('what it accepts', () => {
  it('reads the key out of a stored public URL', () => {
    const r = parseVehiclePhotoRef(`${PUBLIC}vehicles/${V}/1700000000000.jpg`, { projectHost: HOST });
    expect(r.kind).toBe('public_url');
    expect(r.path).toBe(`vehicles/${V}/1700000000000.jpg`);
    expect(r.vehicleId).toBe(V);
  });

  it('reads the key out of a persisted SIGNED url, and says that is what it was', () => {
    // A signed URL in the database is the defect this milestone exists for.
    // It still has to be parseable — that is how the migration rewrites it.
    const r = parseVehiclePhotoRef(`${SIGN}vehicles/${V}/a.jpg?token=eyJhbGciOi.x.y`, { projectHost: HOST });
    expect(r.kind).toBe('signed_url');
    expect(r.path).toBe(`vehicles/${V}/a.jpg`);
  });

  it('passes a bare key through unchanged', () => {
    const r = parseVehiclePhotoRef(`vehicles/${V}/a.jpg`, { projectHost: HOST });
    expect(r.kind).toBe('path');
    expect(r.path).toBe(`vehicles/${V}/a.jpg`);
  });

  it('decodes percent-encoding, because storage wants the real name', () => {
    const r = parseVehiclePhotoRef(`${PUBLIC}vehicles/${V}/front%20left.jpg`, { projectHost: HOST });
    expect(r.path).toBe(`vehicles/${V}/front left.jpg`);
  });

  it('drops a cache-busting query string', () => {
    const r = parseVehiclePhotoRef(`${PUBLIC}vehicles/${V}/a.jpg?v=2`, { projectHost: HOST });
    expect(r.path).toBe(`vehicles/${V}/a.jpg`);
  });
});

describe('what it refuses', () => {
  it('refuses another host', () => {
    const r = parseVehiclePhotoRef(
      `https://evil.example.com/storage/v1/object/public/shop-assets/vehicles/${V}/a.jpg`,
      { projectHost: HOST },
    );
    expect(r.kind).toBe('foreign');
    expect(r.path).toBeNull();
  });

  it('refuses another project on the same provider', () => {
    const r = parseVehiclePhotoRef(
      `https://someoneelse.supabase.co/storage/v1/object/public/shop-assets/vehicles/${V}/a.jpg`,
      { projectHost: HOST },
    );
    expect(r.path).toBeNull();
  });

  it('refuses another bucket', () => {
    const r = parseVehiclePhotoRef(
      `https://${HOST}/storage/v1/object/public/avatars/vehicles/${V}/a.jpg`,
      { projectHost: HOST },
    );
    expect(r.path).toBeNull();
    expect(r.reason).toBe('different bucket');
  });

  it('refuses a URL that is not a storage object route', () => {
    const r = parseVehiclePhotoRef(`https://${HOST}/rest/v1/vehicle_images`, { projectHost: HOST });
    expect(r.path).toBeNull();
  });

  it('refuses traversal, including percent-encoded traversal', () => {
    expect(parseVehiclePhotoRef(`${PUBLIC}vehicles/${V}/../../logo/x/a.jpg`, { projectHost: HOST }).path).toBeNull();
    expect(parseVehiclePhotoRef(`${PUBLIC}vehicles/${V}/%2e%2e/a.jpg`, { projectHost: HOST }).path).toBeNull();
    expect(parseVehiclePhotoRef(`vehicles/${V}/../a.jpg`, { projectHost: HOST }).path).toBeNull();
  });

  it('refuses a non-http scheme and an absolute local path', () => {
    expect(parseVehiclePhotoRef('file:///etc/passwd', { projectHost: HOST }).path).toBeNull();
    expect(parseVehiclePhotoRef('/etc/passwd', { projectHost: HOST }).path).toBeNull();
    expect(parseVehiclePhotoRef('C:\\Windows\\x.jpg', { projectHost: HOST }).path).toBeNull();
  });

  it('treats nothing as nothing', () => {
    expect(parseVehiclePhotoRef(null).kind).toBe('none');
    expect(parseVehiclePhotoRef('   ').kind).toBe('none');
  });
});

describe('the prefix check that stands in for the storage policy', () => {
  it('accepts a well-formed key for its own vehicle', () => {
    expect(validateVehicleObjectPath(`vehicles/${V}/a.jpg`, V).valid).toBe(true);
  });

  it('rejects a key that names a DIFFERENT vehicle', () => {
    // can_read_shop_asset() resolves ownership from the path, so such a row is
    // readable by the other vehicle's shop and not by its own.
    const other = '99999999-8888-7777-6666-555555555555';
    const check = validateVehicleObjectPath(`vehicles/${other}/a.jpg`, V);
    expect(check.valid).toBe(false);
    expect(check.reason).toBe('path names a different vehicle');
  });

  it('rejects a foreign prefix even when it is well-formed', () => {
    expect(validateVehicleObjectPath(`logo/${V}/a.jpg`, V).valid).toBe(false);
  });

  it('rejects a vehicle segment that is not a uuid', () => {
    expect(validateVehicleObjectPath('vehicles/not-a-uuid/a.jpg').valid).toBe(false);
  });

  it('rejects an empty or missing key', () => {
    expect(validateVehicleObjectPath('').valid).toBe(false);
    expect(validateVehicleObjectPath(null).valid).toBe(false);
  });
});

describe('the canonical key', () => {
  it('is bucket-relative and vehicle-scoped', () => {
    expect(canonicalVehicleObjectPath(V, '1700.jpg')).toBe(`vehicles/${V}/1700.jpg`);
  });

  it('cannot be talked out of its own folder by the file name', () => {
    const path = canonicalVehicleObjectPath(V, '../../logo/shop/evil.jpg');
    expect(validateVehicleObjectPath(path, V).valid).toBe(true);
    expect(path.startsWith(`vehicles/${V}/`)).toBe(true);
  });
});

describe('projectHostFromUrl', () => {
  it('takes the host and nothing else', () => {
    expect(projectHostFromUrl(`https://${HOST}`)).toBe(HOST);
    expect(projectHostFromUrl('not a url')).toBeUndefined();
    expect(projectHostFromUrl(undefined)).toBeUndefined();
  });
});
