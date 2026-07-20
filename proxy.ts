import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { PRIVATE_ROUTE_PREFIXES } from '@/lib/seo/config';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Non-production: noindex everything ────────────────────────────────
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv === 'preview' || vercelEnv === 'development') {
    const r = NextResponse.next();
    r.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return r;
  }

  // ── Trailing slash redirect ────────────────────────────────────────────
  if (pathname.endsWith('/') && pathname.length > 1) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(/\/$/, '');
    return NextResponse.redirect(url, { status: 301 });
  }

  const response = NextResponse.next();

  // ── Private routes: add noindex header ────────────────────────────────
  const isPrivate = PRIVATE_ROUTE_PREFIXES.some(p => pathname.startsWith(p));
  if (isPrivate) {
    response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env vars are not yet available, redirect unauthenticated
  // users to login rather than crashing the handler.
  if (!supabaseUrl || !supabaseKey) {
    const fallbackPublic = [
      '/login', '/signup', '/help', '/forgot-password', '/reset-password',
      '/auth/callback', '/landing-preview', '/privacy', '/terms', '/refund-policy',
      '/billing/success', '/billing/canceled', '/api/billing/webhook', '/api/ping',
      '/robots.txt', '/sitemap.xml',
      '/mobile-mechanic-software', '/digital-vehicle-inspection-software',
      '/auto-repair-invoicing-software', '/repair-order-software',
      '/ai-auto-repair-shop-software', '/pricing', '/tools', '/resources', '/compare',
    ];
    const isPublicFallback = fallbackPublic.some(p => request.nextUrl.pathname.startsWith(p));
    if (!isPublicFallback) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { session } } = await supabase.auth.getSession();

  // Public paths: authentication-free access required.
  // Marketing routes and static SEO files MUST be here — auth proxy must not block them.
  const publicPaths = [
    // Auth flows
    '/login', '/signup', '/help', '/forgot-password', '/reset-password',
    '/auth/callback',
    // Legal / billing
    '/privacy', '/terms', '/refund-policy',
    '/billing/success', '/billing/canceled',
    // API endpoints that don't need auth
    '/api/billing/webhook', '/api/ping',
    // Internal preview (noindex)
    '/landing-preview',
    // SEO / crawler files
    '/robots.txt', '/sitemap.xml',
    // ── Marketing pages (all public) ──────────────────────────────────────
    '/mobile-mechanic-software',
    '/digital-vehicle-inspection-software',
    '/auto-repair-invoicing-software',
    '/repair-order-software',
    '/ai-auto-repair-shop-software',
    '/pricing',
    '/tools',
    '/resources',
    '/compare',
  ];
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));
  const isRoot = request.nextUrl.pathname === '/';

  // PKCE invite/recovery: Supabase sometimes redirects to site root with ?code=XXX.
  // Only intercept if the current path is NOT already /auth/callback — otherwise we'd
  // redirect /auth/callback?code=XXX to itself, causing ERR_TOO_MANY_REDIRECTS.
  const code = request.nextUrl.searchParams.get('code');
  if (code && !session && !request.nextUrl.pathname.startsWith('/auth/callback')) {
    const callbackUrl = new URL('/auth/callback', request.url);
    callbackUrl.searchParams.set('code', code);
    return NextResponse.redirect(callbackUrl);
  }

  if (!session && isRoot) {
    return NextResponse.rewrite(new URL('/landing-preview', request.url));
  }

  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)).*)'],
};
