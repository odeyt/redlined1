import { type NextRequest, NextResponse } from 'next/server';
import { PRIVATE_ROUTE_PREFIXES } from '@/lib/seo/config';

/**
 * Middleware — applied to all matched routes.
 *
 * Responsibilities:
 * 1. Enforce X-Robots-Tag: noindex, nofollow on private / authenticated routes
 * 2. Enforce noindex on non-production Vercel deployments (preview, branch deploys)
 * 3. Redirect trailing slashes (except root) to clean URLs
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ── Non-production: block all indexing ─────────────────────────────────
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
  }

  // ── Trailing slash redirect ────────────────────────────────────────────
  if (pathname.endsWith('/') && pathname.length > 1) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/$/, '');
    return NextResponse.redirect(url, { status: 301 });
  }

  // ── Private routes: add noindex header ────────────────────────────────
  const isPrivate = PRIVATE_ROUTE_PREFIXES.some(prefix => pathname.startsWith(prefix));
  if (isPrivate) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - Public assets (images, fonts, etc.)
     */
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|manifest\\.json|sw\\.js|logo\\.png).*)',
  ],
};
