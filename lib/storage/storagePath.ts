/**
 * Pure helpers shared by the server and client signers. No imports, no
 * 'server-only', so both sides can use the same parse — a second copy of this
 * logic that drifted would produce URLs that fail only for some callers.
 */

export const SHOP_ASSETS_BUCKET = 'shop-assets';

const MARKER = `/${SHOP_ASSETS_BUCKET}/`;

/**
 * Extracts the object path from whatever is stored in the database.
 *
 * Rows store a fully-qualified public URL
 * (".../object/public/shop-assets/vehicles/<id>/<file>.jpg"), sometimes with
 * a cache-busting query string. Returns null for anything that is not an
 * object in this bucket, so callers can pass such values through untouched.
 */
export function toStoragePath(value: string | null | undefined): string | null {
  if (!value) return null;
  const idx = value.indexOf(MARKER);
  if (idx === -1) return null;
  const raw = value.slice(idx + MARKER.length).split('?')[0];
  if (!raw) return null;
  // Stored URLs are percent-encoded; the storage API wants the real path.
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
