/**
 * Photo replacement, in the only order that cannot lose a photo.
 *
 * The rule: the new object exists BEFORE the database points at it, and the
 * old object is removed only AFTER the database has stopped pointing at it and
 * confirmed so. Anything else has a window in which the row names a file that
 * is not there — which, to the person looking at the screen, is the same thing
 * as the photo having been deleted.
 *
 * The other rule: a removal names one exact key that has been checked against
 * the vehicle it belongs to. Never a prefix, never a wildcard, never a value
 * that came in from a component and might be stale, and never anything built
 * out of a customer name, a VIN or a plate.
 */
import {
  uploadVehicleImage,
  replaceVehicleImage,
  deleteVehicleImage,
  fetchVehicleImages,
  vehicleImageRef,
} from '../vehicleImageService';

const HOST = 'ldjrlvjkmzrcdqhetqoh.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HOST}`;

const V = '11111111-2222-3333-4444-555555555555';
const OTHER_V = '99999999-8888-7777-6666-555555555555';

/** Every call, in order, so ordering itself can be asserted. */
let events: string[] = [];
type Answer = { data: unknown; error: unknown };
/**
 * What each terminal operation answers with.
 *
 * An array is consumed in order and the last entry sticks, so a test can say
 * "this insert fails, the retry succeeds" without a bespoke mock.
 */
let results: Record<string, Answer | Answer[]> = {};

function take(kind: string): Answer {
  const r = results[kind];
  if (!Array.isArray(r)) return r;
  return r.length > 1 ? r.shift()! : r[0];
}

function chainFor(table: string) {
  let kind = '';
  const chain: Record<string, unknown> = {};
  const record = (op: string, payload?: unknown) => {
    if (!kind && ['select', 'insert', 'update', 'delete'].includes(op)) kind = op;
    events.push(`db.${op}:${table}${payload !== undefined ? `:${JSON.stringify(payload)}` : ''}`);
    return chain;
  };
  chain.select = () => record('select');
  chain.eq = (col: string, val: string) => record('eq', [col, val]);
  chain.order = () => record('order');
  chain.insert = (p: unknown) => record('insert', p);
  chain.update = (p: unknown) => record('update', p);
  chain.delete = () => record('delete');
  chain.single = () => Promise.resolve(take(kind === 'select' ? 'existing' : kind));
  chain.maybeSingle = () => Promise.resolve(take(kind === 'select' ? 'row' : kind));
  chain.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve(take(kind === 'select' ? 'list' : kind)).then(res, rej);
  return chain;
}

const storageUpload = jest.fn();
const storageRemove = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => chainFor(table),
    storage: {
      from: () => ({
        upload: (path: string, file: unknown, opts: unknown) => {
          events.push(`storage.upload:${path}`);
          return storageUpload(path, file, opts);
        },
        getPublicUrl: (path: string) => {
          events.push(`storage.getPublicUrl:${path}`);
          return { data: { publicUrl: `https://${HOST}/storage/v1/object/public/shop-assets/${path}` } };
        },
        remove: (paths: string[]) => {
          events.push(`storage.remove:${JSON.stringify(paths)}`);
          return storageRemove(paths);
        },
      }),
    },
  },
}));

jest.mock('@/lib/image/prepareUpload', () => ({
  prepareImageForUpload: (file: { name: string; type: string }) => Promise.resolve(file),
}));

function fakeFile(name = 'photo.jpg') {
  return { name, type: 'image/jpeg', size: 1024 } as unknown as File;
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'img-1',
    vehicle_id: V,
    url: `https://${HOST}/storage/v1/object/public/shop-assets/vehicles/${V}/old.jpg`,
    storage_path: `vehicles/${V}/old.jpg`,
    label: 'Vehicle photo',
    ...overrides,
  };
}

beforeEach(() => {
  events = [];
  results = {};
  storageUpload.mockReset().mockResolvedValue({ error: null });
  storageRemove.mockReset().mockResolvedValue({ error: null });
  jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => { jest.restoreAllMocks(); });

const NEW_PATH = `vehicles/${V}/1700000000000.jpg`;

describe('uploading a photo', () => {
  it('puts the object up BEFORE the row that names it', async () => {
    results.insert = { data: row({ storage_path: NEW_PATH, url: `https://${HOST}/storage/v1/object/public/shop-assets/${NEW_PATH}` }), error: null };

    const img = await uploadVehicleImage(V, fakeFile());

    const uploadAt = events.findIndex(e => e.startsWith('storage.upload:'));
    const insertAt = events.findIndex(e => e.startsWith('db.insert:'));
    expect(uploadAt).toBeGreaterThanOrEqual(0);
    expect(insertAt).toBeGreaterThan(uploadAt);
    expect(img.storagePath).toBe(NEW_PATH);
  });

  it('persists the stable key, and a url that is not a signed one', async () => {
    results.insert = { data: row({ storage_path: NEW_PATH }), error: null };
    await uploadVehicleImage(V, fakeFile());

    const insert = events.find(e => e.startsWith('db.insert:'))!;
    expect(insert).toContain(`"storage_path":"${NEW_PATH}"`);
    expect(insert).not.toContain('token=');
    expect(insert).not.toContain('/object/sign/');
  });

  it('uploads under the vehicle it was given, whatever the file is called', async () => {
    results.insert = { data: row({ storage_path: NEW_PATH }), error: null };
    await uploadVehicleImage(V, fakeFile('../../logo/other-shop/evil.jpg'));
    const upload = events.find(e => e.startsWith('storage.upload:'))!;
    expect(upload.startsWith(`storage.upload:vehicles/${V}/`)).toBe(true);
    expect(upload).not.toContain('..');
  });

  it('removes only the object it just created when the row cannot be written', async () => {
    results.insert = { data: null, error: { message: 'insert failed' } };

    await expect(uploadVehicleImage(V, fakeFile())).rejects.toBeTruthy();

    // Exactly one key, exactly the one that was just uploaded.
    const removes = events.filter(e => e.startsWith('storage.remove:'));
    expect(removes).toHaveLength(1);
    expect(removes[0]).toBe(`storage.remove:["${NEW_PATH}"]`);
  });

  it('writes nothing when the object upload itself fails', async () => {
    storageUpload.mockResolvedValue({ error: { message: 'storage down' } });
    await expect(uploadVehicleImage(V, fakeFile())).rejects.toBeTruthy();
    expect(events.some(e => e.startsWith('db.insert'))).toBe(false);
    expect(events.some(e => e.startsWith('storage.remove'))).toBe(false);
  });
});

describe('replacing a photo', () => {
  it('goes upload, then database, then — and only then — cleanup', async () => {
    results.existing = { data: row(), error: null };
    results.update = { data: row({ storage_path: NEW_PATH }), error: null };

    await replaceVehicleImage('img-1', V, fakeFile(), { removeOldObject: true });

    const upload = events.findIndex(e => e === `storage.upload:${NEW_PATH}`);
    const update = events.findIndex(e => e.startsWith('db.update:'));
    const remove = events.findIndex(e => e.startsWith('storage.remove:'));
    expect(upload).toBeGreaterThanOrEqual(0);
    expect(update).toBeGreaterThan(upload);
    expect(remove).toBeGreaterThan(update);
    expect(events[remove]).toBe(`storage.remove:["vehicles/${V}/old.jpg"]`);
  });

  it('leaves the old photo completely alone when the database update fails', async () => {
    results.existing = { data: row(), error: null };
    results.update = { data: null, error: { message: 'update failed' } };

    await expect(replaceVehicleImage('img-1', V, fakeFile(), { removeOldObject: true })).rejects.toBeTruthy();

    const removes = events.filter(e => e.startsWith('storage.remove:'));
    // The orphaned NEW object is cleaned up; the OLD one is untouched, because
    // the row still points at it.
    expect(removes).toEqual([`storage.remove:["${NEW_PATH}"]`]);
  });

  it('does not remove the superseded object unless asked to', async () => {
    results.existing = { data: row(), error: null };
    results.update = { data: row({ storage_path: NEW_PATH }), error: null };
    await replaceVehicleImage('img-1', V, fakeFile());
    expect(events.some(e => e.startsWith('storage.remove:'))).toBe(false);
  });

  it('refuses to clean up an old object that belongs to another vehicle', async () => {
    results.existing = { data: row({ storage_path: `vehicles/${OTHER_V}/old.jpg`, url: '' }), error: null };
    results.update = { data: row({ storage_path: NEW_PATH }), error: null };
    await replaceVehicleImage('img-1', V, fakeFile(), { removeOldObject: true });
    expect(events.some(e => e.startsWith('storage.remove:'))).toBe(false);
  });
});

describe('deleting a photo', () => {
  it('deletes the row first and the object second', async () => {
    results.row = { data: row(), error: null };
    results.delete = { data: null, error: null };

    await deleteVehicleImage('img-1', 'ignored', V);

    const del = events.findIndex(e => e.startsWith('db.delete:'));
    const remove = events.findIndex(e => e.startsWith('storage.remove:'));
    expect(del).toBeGreaterThanOrEqual(0);
    expect(remove).toBeGreaterThan(del);
  });

  it('removes the key from the row, not whatever the caller passed in', async () => {
    results.row = { data: row(), error: null };
    results.delete = { data: null, error: null };

    await deleteVehicleImage('img-1', `vehicles/${OTHER_V}/somebody-elses.jpg`, V);

    expect(events.filter(e => e.startsWith('storage.remove:'))).toEqual([
      `storage.remove:["vehicles/${V}/old.jpg"]`,
    ]);
  });

  it('removes nothing when the row delete fails', async () => {
    results.row = { data: row(), error: null };
    results.delete = { data: null, error: { message: 'denied' } };
    await expect(deleteVehicleImage('img-1', '', V)).rejects.toBeTruthy();
    expect(events.some(e => e.startsWith('storage.remove:'))).toBe(false);
  });

  it('refuses a photo that belongs to a different vehicle', async () => {
    results.row = { data: row({ vehicle_id: OTHER_V }), error: null };
    await expect(deleteVehicleImage('img-1', '', V)).rejects.toThrow(/another vehicle/);
    expect(events.some(e => e.startsWith('db.delete'))).toBe(false);
    expect(events.some(e => e.startsWith('storage.remove'))).toBe(false);
  });

  it('does nothing at all when the row is already gone', async () => {
    results.row = { data: null, error: null };
    await deleteVehicleImage('img-1', '', V);
    expect(events.some(e => e.startsWith('db.delete'))).toBe(false);
    expect(events.some(e => e.startsWith('storage.remove'))).toBe(false);
  });
});

describe('deploying before the migration has run', () => {
  const MISSING = { code: 'PGRST204', message: "Could not find the 'storage_path' column of 'vehicle_images' in the schema cache" };

  it('still saves the photo, writing only the columns that exist', async () => {
    // The window between a deploy going live and the SQL being applied. A
    // browser picks up the new bundle immediately; losing the technician's
    // photo for the duration is not an acceptable way to spend that window.
    results.insert = [
      { data: null, error: MISSING },
      { data: row({ storage_path: undefined }), error: null },
    ];

    const img = await uploadVehicleImage(V, fakeFile());

    const inserts = events.filter(e => e.startsWith('db.insert:'));
    expect(inserts).toHaveLength(2);
    expect(inserts[0]).toContain('"storage_path"');
    expect(inserts[1]).not.toContain('"storage_path"');
    // The key is still derivable from the url, so nothing is actually lost.
    expect(img.storagePath).toBe(`vehicles/${V}/old.jpg`);
    expect(events.some(e => e.startsWith('storage.remove'))).toBe(false);
  });

  it('retries a replacement the same way', async () => {
    results.existing = { data: row(), error: null };
    results.update = [
      { data: null, error: MISSING },
      { data: row({ storage_path: undefined }), error: null },
    ];

    await replaceVehicleImage('img-1', V, fakeFile());

    const updates = events.filter(e => e.startsWith('db.update:'));
    expect(updates).toHaveLength(2);
    expect(updates[1]).not.toContain('"storage_path"');
  });

  it('does NOT retry on an ordinary failure, and cleans up the orphan once', async () => {
    // Only the missing-column error earns a second attempt. Anything else is a
    // real failure and retrying it would just upload-and-abandon twice.
    results.insert = { data: null, error: { code: '23505', message: 'duplicate key' } };
    await expect(uploadVehicleImage(V, fakeFile())).rejects.toBeTruthy();
    expect(events.filter(e => e.startsWith('db.insert:'))).toHaveLength(1);
    expect(events.filter(e => e.startsWith('storage.remove:'))).toHaveLength(1);
  });
});

describe('reading photos on either side of the migration', () => {
  it('prefers the stored key', async () => {
    results.list = { data: [row()], error: null };
    const [img] = await fetchVehicleImages(V);
    expect(img.storagePath).toBe(`vehicles/${V}/old.jpg`);
    expect(vehicleImageRef(img)).toBe(`vehicles/${V}/old.jpg`);
  });

  it('derives the key from a legacy url when the column is not there yet', async () => {
    results.list = { data: [{ ...row(), storage_path: undefined }], error: null };
    const [img] = await fetchVehicleImages(V);
    expect(img.storagePath).toBe(`vehicles/${V}/old.jpg`);
  });

  it('refuses to derive a key from a url on another host, and falls back to the url', async () => {
    const foreign = `https://evil.example.com/storage/v1/object/public/shop-assets/vehicles/${V}/a.jpg`;
    results.list = { data: [{ ...row(), storage_path: undefined, url: foreign }], error: null };
    const [img] = await fetchVehicleImages(V);
    expect(img.storagePath).toBe('');
    expect(vehicleImageRef(img)).toBe(foreign);
  });

  it('refuses a key that names a different vehicle than the row', async () => {
    results.list = { data: [row({ storage_path: `vehicles/${OTHER_V}/a.jpg` })], error: null };
    const [img] = await fetchVehicleImages(V);
    expect(img.storagePath).toBe('');
  });
});
