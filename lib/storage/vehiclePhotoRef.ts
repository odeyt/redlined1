/**
 * The canonical form of a vehicle photo reference, and the only place that is
 * allowed to turn a stored value into a storage key.
 *
 * ## Why this exists
 *
 * `vehicle_images.url` holds a fully-qualified Supabase URL, not a key. That
 * was harmless while the bucket was public and a stored URL was also a
 * working URL. Since the bucket flipped to private (2026-09-07) the stored
 * value is no longer renderable on its own: every read has to be signed, and
 * a signature expires. The durable reference therefore has to be the object
 * KEY — `vehicles/<vehicle-id>/<file>` — and the URL becomes a legacy
 * encoding of it.
 *
 * `toStoragePath()` in ./storagePath already extracts a key, but it does it
 * by string-slicing on "/shop-assets/" with no idea what host, project or
 * prefix it is looking at. That is fine for its callers (they only ever feed
 * it values the app itself wrote) and wrong as a migration primitive: a
 * backfill reads whatever is in the column, including rows written by older
 * code, and must refuse anything it cannot positively identify rather than
 * synthesising a key that points somewhere unintended.
 *
 * So: `toStoragePath` stays as the lenient render-time helper, and this
 * module is the strict one. It validates host, storage route, bucket and the
 * `vehicles/<uuid>/…` shape, rejects traversal, and reports WHY it refused so
 * reconciliation can classify rather than merely drop.
 *
 * Pure: no imports from supabase, no `server-only`. Both the browser, the
 * migration script and the tests use the same parse — a second copy that
 * drifted is how a backfill writes keys the render path cannot sign.
 */

export const SHOP_ASSETS_BUCKET = 'shop-assets';

/** The one prefix vehicle photos are stored under. */
export const VEHICLE_PREFIX = 'vehicles';

/**
 * Supabase storage serves the same object under three routes. `public` is
 * what the app stored while the bucket was public, `sign` is a signed URL
 * (which must never be persisted), `authenticated` is the session-scoped
 * read. All three name the same key, so all three are parseable — what
 * differs is whether finding one in the database is a problem.
 */
const STORAGE_ROUTE = /^\/storage\/v1\/object\/(public|sign|authenticated)\/([^/]+)\/(.+)$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RefKind =
  /** Nothing stored. */
  | 'none'
  /** Already a bucket-relative key — the canonical form. */
  | 'path'
  /** A `/object/public/` URL, the historical stored form. */
  | 'public_url'
  /** A `/object/sign/` URL: an expiring token that was persisted. */
  | 'signed_url'
  /** A `/object/authenticated/` URL. */
  | 'authenticated_url'
  /** Parseable as a URL, but not this project's storage. */
  | 'foreign';

export interface ParsedRef {
  kind: RefKind;
  /**
   * The bucket-relative object key, decoded, with any query string removed.
   * Null whenever the value could not be positively identified as an object
   * in this project's shop-assets bucket.
   */
  path: string | null;
  /** The `<vehicle-id>` segment, when the key has the vehicle shape. */
  vehicleId: string | null;
  /** Why `path` is null, or why the key is not canonical. Never echoes a token. */
  reason?: string;
}

export interface ParseOptions {
  /**
   * The Supabase host this deployment is bound to, e.g.
   * `ldjrlvjkmzrcdqhetqoh.supabase.co`. A value hosted anywhere else is
   * `foreign` and is never converted into a key: a URL is attacker-influenced
   * input the moment anything other than this app can write the column.
   *
   * Omit it to accept any host — only appropriate in unit tests that are
   * asserting shape rather than provenance.
   */
  projectHost?: string;
  /** Bucket to accept. Defaults to shop-assets. */
  bucket?: string;
}

function decodeSegments(raw: string): { segments: string[] | null; reason?: string } {
  const segments: string[] = [];
  for (const part of raw.split('/')) {
    if (part === '') return { segments: null, reason: 'empty path segment' };
    let decoded: string;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      return { segments: null, reason: 'undecodable percent-encoding' };
    }
    // Checked AFTER decoding: %2e%2e is the same traversal as ".." and a
    // check on the raw string would wave it through.
    if (decoded === '.' || decoded === '..') return { segments: null, reason: 'path traversal' };
    if (decoded.includes('/') || decoded.includes('\\')) {
      return { segments: null, reason: 'separator inside a segment' };
    }
    if (decoded.includes('\0')) return { segments: null, reason: 'null byte' };
    segments.push(decoded);
  }
  return { segments };
}

/**
 * Identifies whatever is stored in the column.
 *
 * Never throws: a reconciliation pass over production data must classify every
 * row, including the ones written by code nobody remembers.
 */
export function parseVehiclePhotoRef(
  value: string | null | undefined,
  options: ParseOptions = {},
): ParsedRef {
  const bucket = options.bucket ?? SHOP_ASSETS_BUCKET;
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { kind: 'none', path: null, vehicleId: null };

  let kind: RefKind;
  let rawPath: string;

  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) {
    // Checked on the RAW string, before URL parsing: the URL constructor
    // resolves dot-segments against the path as part of normalization, so by
    // the time url.pathname exists, a ".." segment has already done its
    // traversal and is gone from the string this function ever sees again.
    // WHATWG treats "%2e" (any case) as equivalent to "." for this purpose,
    // so a segment built from one or two dot-units - literal or %2e - is
    // exactly what the spec itself would normalize away, and has to be
    // rejected on the same terms rather than on the literal "." / ".." forms
    // alone.
    if (/(^|\/)(?:\.|%2e){1,2}(\/|$)/i.test(trimmed)) {
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'path traversal' };
    }
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'unparseable URL' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'non-http scheme' };
    }
    if (options.projectHost && url.host.toLowerCase() !== options.projectHost.toLowerCase()) {
      // Deliberately does not report the host: this string can come from the
      // database and reconciliation output is read by people, in tickets.
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'host is not this project' };
    }
    const match = STORAGE_ROUTE.exec(url.pathname);
    if (!match) {
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'not a storage object route' };
    }
    const [, route, urlBucket, rest] = match;
    if (urlBucket !== bucket) {
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'different bucket' };
    }
    kind = route === 'sign' ? 'signed_url' : route === 'public' ? 'public_url' : 'authenticated_url';
    rawPath = rest;
  } else {
    // A bare key. Anything absolute or Windows-ish is not one.
    if (trimmed.startsWith('/') || trimmed.startsWith('\\') || /^[a-z]:[\\/]/i.test(trimmed)) {
      return { kind: 'foreign', path: null, vehicleId: null, reason: 'absolute path' };
    }
    kind = 'path';
    // A stored key should not carry a query string, but a cache-buster on the
    // end of one is exactly the sort of thing that got written by hand.
    rawPath = trimmed.split('?')[0].split('#')[0];
  }

  if (kind !== 'path') rawPath = rawPath.split('?')[0].split('#')[0];

  const { segments, reason } = decodeSegments(rawPath);
  if (!segments) return { kind, path: null, vehicleId: null, reason };

  const path = segments.join('/');
  const vehicleId = segments[0] === VEHICLE_PREFIX && UUID.test(segments[1] ?? '') ? segments[1] : null;
  return { kind, path, vehicleId };
}

export interface PathValidation {
  valid: boolean;
  reason?: string;
}

/**
 * Is this key one this app is allowed to sign, remove or persist for a given
 * vehicle?
 *
 * `expectedVehicleId` is what turns a shape check into an authorization
 * check. The storage policy (`can_read_shop_asset`) resolves ownership by
 * reading the vehicle id OUT of the path, so a row whose key names a
 * different vehicle is readable by that other vehicle's shop and not by its
 * own — passing the row's vehicle id in here is what catches that before it
 * becomes a support ticket.
 */
export function validateVehicleObjectPath(
  path: string | null | undefined,
  expectedVehicleId?: string,
): PathValidation {
  if (!path) return { valid: false, reason: 'empty path' };
  const segments = path.split('/');
  if (segments.length < 3) return { valid: false, reason: 'not vehicles/<id>/<file>' };
  if (segments[0] !== VEHICLE_PREFIX) return { valid: false, reason: 'wrong prefix' };
  if (!UUID.test(segments[1])) return { valid: false, reason: 'vehicle id is not a uuid' };
  if (segments.some(s => s === '' || s === '.' || s === '..')) {
    return { valid: false, reason: 'path traversal' };
  }
  if (expectedVehicleId && segments[1].toLowerCase() !== expectedVehicleId.toLowerCase()) {
    return { valid: false, reason: 'path names a different vehicle' };
  }
  return { valid: true };
}

/** The key a new upload gets. The only place the layout is written down. */
export function canonicalVehicleObjectPath(vehicleId: string, fileName: string): string {
  const safe = fileName.replace(/[\\/]/g, '_').replace(/^\.+/, '');
  return `${VEHICLE_PREFIX}/${vehicleId}/${safe}`;
}

/** Host of the project this build talks to, for `projectHost`. */
export function projectHostFromUrl(supabaseUrl: string | null | undefined): string | undefined {
  if (!supabaseUrl) return undefined;
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return undefined;
  }
}
