/**
 * Deleting a record must delete its file.
 *
 * Three services removed storage objects by slicing or regexing the stored
 * URL and passing the result straight to storage.remove(). The capture is
 * PERCENT-ENCODED, so removing a photo of "PTT Dynamic Turbo" asked the bucket
 * for "PTT%20Dynamic%20Turbo/...". `remove()` does not error on a key that is
 * not there, so the row was updated, the caller saw success, and the file
 * stayed in the bucket forever.
 *
 * It only ever leaked on names needing encoding — a part number like
 * "17801-0C010" encodes to itself, which is why almost everything worked and
 * the two files that did leak looked like a mystery rather than a bug.
 *
 * `toStoragePath` decodes and strips any ?cache-buster, and is already shared
 * by both signers. These tests pin the paths to it, and pin that deletePart
 * cleans up at all — it never touched storage.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { toStoragePath } from '../../lib/storage/storagePath';

const PUBLIC = 'https://x.supabase.co/storage/v1/object/public/shop-assets/';

describe('toStoragePath on the names that leaked', () => {
  it('decodes a space', () => {
    expect(toStoragePath(PUBLIC + 'parts/shop1/PTT%20Dynamic%20Turbo/1.jpeg'))
      .toBe('parts/shop1/PTT Dynamic Turbo/1.jpeg');
  });

  it('keeps a slash inside a part number as extra folders', () => {
    // The bucket really does hold this as nested directories, and signing
    // works on it — so the path must be preserved, not sanitised.
    expect(toStoragePath(PUBLIC + 'parts/shop1/FL-2137%20/%20FL-910S/1.jpeg'))
      .toBe('parts/shop1/FL-2137 / FL-910S/1.jpeg');
  });

  it('drops a cache-busting query string', () => {
    expect(toStoragePath(PUBLIC + 'parts/shop1/Shell%20DOT%203/1.jpeg?v=2'))
      .toBe('parts/shop1/Shell DOT 3/1.jpeg');
  });

  it('leaves a plain part number untouched', () => {
    expect(toStoragePath(PUBLIC + 'parts/shop1/17801-0C010/1.jpeg'))
      .toBe('parts/shop1/17801-0C010/1.jpeg');
  });
});

describe('services do not hand-roll a storage path', () => {
  const FILES = ['partsService.ts', 'vehicleImageService.ts', 'entityImageService.ts'];

  it.each(FILES)('%s removes objects via toStoragePath', file => {
    const source = readFileSync(join(process.cwd(), 'services', file), 'utf8');
    expect(source).toContain('toStoragePath');
    // The two shapes that caused this bug. Either one back in a service means
    // an encoded path reaches storage.remove() again.
    expect(source).not.toMatch(/match\(\/shop-assets/);
    expect(source).not.toMatch(/url\.slice\(idx \+ marker\.length\)/);
  });

  it('deletePart removes the photos before dropping the rows', () => {
    const source = readFileSync(join(process.cwd(), 'services', 'partsService.ts'), 'utf8');
    const body = source.slice(source.indexOf('export async function deletePart('));
    const end = body.indexOf('export async function reservePart');
    const deletePart = body.slice(0, end === -1 ? undefined : end);

    expect(deletePart).toContain("storage.from('shop-assets').remove(");
    expect(deletePart).toContain('toStoragePath');
    // Collected across every matching row: parts are keyed on
    // (shop_id, part_number), so a two-location shop holds this number twice
    // and each row carries its own photos.
    expect(deletePart).toContain("select('photos')");
  });
});
