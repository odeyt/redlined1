/**
 * lib/seo/urls.ts
 *
 * URL construction utilities for the SEO system.
 * All public URLs should be generated through these helpers to ensure
 * consistent canonical origin, no trailing slashes, and no query params.
 */

import { SITE_CONFIG } from './config';

/** Build an absolute URL from a path, using the canonical origin */
export function absoluteUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  // Strip trailing slash (except root)
  const normalized = clean.length > 1 ? clean.replace(/\/$/, '') : clean;
  return `${SITE_CONFIG.origin}${normalized}`;
}

/** Build a canonical URL for a given slug */
export function canonicalUrl(slug: string): string {
  return absoluteUrl(slug);
}

/** Strip tracking parameters and trailing slashes from a URL */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove common tracking params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'fbclid', 'gclid', '_ga'];
    trackingParams.forEach(p => u.searchParams.delete(p));
    // Normalize pathname
    if (u.pathname.endsWith('/') && u.pathname.length > 1) {
      u.pathname = u.pathname.replace(/\/$/, '');
    }
    return u.toString();
  } catch {
    return url;
  }
}

/** Return the path segment of a URL (for breadcrumb generation) */
export function pathSegments(slug: string): string[] {
  return slug.split('/').filter(Boolean);
}

/** Generate a breadcrumb trail from a slug */
export function breadcrumbsFromSlug(
  slug: string,
  labels?: Record<string, string>,
): Array<{ name: string; href: string }> {
  const segments = pathSegments(slug);
  const crumbs: Array<{ name: string; href: string }> = [
    { name: 'Home', href: '/' },
  ];
  let accumulated = '';
  for (const segment of segments) {
    accumulated += `/${segment}`;
    const label = labels?.[segment] ?? segment.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    crumbs.push({ name: label, href: accumulated });
  }
  return crumbs;
}

/** Check if a given pathname should be blocked from indexing */
export function isPrivateRoute(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some(prefix => pathname.startsWith(prefix));
}
