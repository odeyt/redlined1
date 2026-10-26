/** Exact public content routes, never a prefix allowance for private pages. */
export const SEO_PAGE_PATHS = [
  '/mobile-mechanic-software',
  '/digital-vehicle-inspection-software',
] as const;

export function isSeoPagePath(pathname: string): boolean {
  return SEO_PAGE_PATHS.some(path => pathname === path || pathname === `${path}/`);
}
