/**
 * features/admin/shared/queryString.ts
 * Small helpers for building searchParams-preserving hrefs, so pagination,
 * sorting, and filtering on the owner-admin pages work as plain <Link>s and
 * <form method="GET">s — no client-side state, no fetch-in-effect.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Normalizes a Next.js searchParams value (string | string[] | undefined) to a single string. */
export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Builds `path?a=1&b=2` from a plain params object, dropping empty/undefined values. */
export function buildHref(path: string, params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}
