/**
 * Server-side signed URLs for shop-assets.
 *
 * The three customer-facing surfaces — /inspection/[token], /status/[token]
 * and /portal/[token] — are opened by people with no account and no session.
 * They cannot sign a URL themselves, so the server does it for them with the
 * service role and hands back a short-lived link.
 *
 * This is step 1 of making the bucket private. It is deliberately useful
 * before that flip and harmless after it: signed URLs work on public buckets
 * too, so these surfaces can move to signing now and keep working either way.
 *
 * What this does NOT do: restrict anything. As of 2026-08-12 storage.objects
 * grants SELECT to anon, so anyone holding the publishable key can list the
 * bucket and sign any object themselves. Signing here does not change that —
 * only a scoped SELECT policy plus `public = false` will. Do not describe this
 * module as a security control until both have landed.
 *
 * Server-only: it uses the service-role key.
 */
import 'server-only';
import { getAdminDb } from '@/lib/supabaseServer';

const BUCKET = 'shop-assets';
const MARKER = `/${BUCKET}/`;

/**
 * Default lifetime for a customer-facing link.
 *
 * Long enough that a customer reading a report, stepping away, and coming
 * back does not hit dead images; short enough that a forwarded link stops
 * working the same day. The page is re-fetched on load, so each visit mints
 * fresh URLs.
 */
export const CUSTOMER_LINK_TTL_SECONDS = 60 * 60 * 4; // 4 hours

/**
 * Extracts the object path from whatever is stored in the database.
 *
 * Historically every row stores a fully-qualified public URL
 * (".../object/public/shop-assets/vehicles/<id>/<file>.jpg"), sometimes with
 * a cache-busting query string. Returns null for anything that is not an
 * object in this bucket, so callers can pass values through untouched.
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

/**
 * Signs a batch of stored URLs, returning a lookup keyed by the ORIGINAL
 * value so callers can substitute in place without tracking indexes.
 *
 * One round trip for the whole set — an inspection report can carry dozens of
 * photos, and signing them one at a time is what makes a report page slow.
 *
 * A value that cannot be signed is simply absent from the map, and callers
 * fall back to the original. A missing photo is better than a broken page,
 * and while the bucket is still public the original URL keeps working.
 */
export async function signStoredUrls(
  values: Array<string | null | undefined>,
  expiresIn: number = CUSTOMER_LINK_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  // Deduplicate: the same logo appears on every row of a report.
  const byPath = new Map<string, string[]>();
  for (const v of values) {
    const path = toStoragePath(v);
    if (!path || !v) continue;
    const originals = byPath.get(path);
    if (originals) originals.push(v);
    else byPath.set(path, [v]);
  }
  if (byPath.size === 0) return out;

  const paths = [...byPath.keys()];
  const { data, error } = await getAdminDb()
    .storage.from(BUCKET)
    .createSignedUrls(paths, expiresIn);

  if (error || !data) {
    // Leaving the map empty means every caller falls back to the stored URL.
    console.error('[signServer] batch signing failed:', error?.message);
    return out;
  }

  for (const row of data) {
    if (row.error || !row.signedUrl || !row.path) continue;
    for (const original of byPath.get(row.path) ?? []) {
      out.set(original, row.signedUrl);
    }
  }
  return out;
}

/** Convenience for a single value — returns the original if signing fails. */
export async function signStoredUrl(
  value: string | null | undefined,
  expiresIn: number = CUSTOMER_LINK_TTL_SECONDS,
): Promise<string> {
  if (!value) return '';
  const signed = await signStoredUrls([value], expiresIn);
  return signed.get(value) ?? value;
}
