import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * An API route must answer with JSON, never a redirect.
 *
 * Redirecting /api/* to /login is meaningless to a caller that expected data:
 * fetch() follows the 307, receives an HTML login page, and `res.json()` throws
 * "Unexpected end of JSON input" — which says nothing about the actual problem.
 * That error appeared twice on 2026-08-03, once in checkout and once when
 * probing /api/ai, and cost real time to trace both times.
 *
 * A status code the client can act on, and a message it can show.
 */
function apiJson(status: number, error: string, detail: string) {
  return NextResponse.json({ error, detail }, { status });
}

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  // Route handlers only. Pages still redirect, which is right for a browser.
  const isApiRoute = request.nextUrl.pathname.startsWith('/api/');

  // A note on the public list below: /api/push/send sits there beside
  // /api/billing/webhook for the same reason. Both are called by a machine —
  // Supabase's database webhook and the payment provider — so there is no
  // session to check and this proxy would reject them before the handler ran.
  // Observed exactly that: the webhook fired, and net._http_response recorded
  // 401 "Your session has expired", which is this file's message, not the
  // route's.
  //
  // Neither endpoint is actually unauthenticated. Each verifies a shared
  // secret itself — x-push-secret here — so being listed as public means
  // "authenticated differently", not "open".

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env vars are not yet available, redirect unauthenticated
  // users to login rather than crashing the handler.
  if (!supabaseUrl || !supabaseKey) {
    const publicPaths = ['/login', '/signup', '/help', '/forgot-password', '/reset-password', '/auth/callback', '/landing-preview', '/privacy', '/terms', '/refund-policy', '/billing/success', '/billing/canceled', '/contact-sales', '/api/billing/webhook', '/api/contact-sales', '/api/ping', '/api/push/send'];
    const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));
    if (!isPublic) {
      // 503, not 401: the caller's credentials are not the problem — the server
      // is misconfigured. Sending 401 here would have a client uselessly
      // re-authenticating against an outage it cannot fix.
      if (isApiRoute) {
        return apiJson(503, 'Service unavailable', 'The server is not fully configured. Please try again shortly.');
      }
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

  const publicPaths = ['/login', '/signup', '/help', '/forgot-password', '/reset-password', '/auth/callback', '/landing-preview', '/privacy', '/terms', '/refund-policy', '/billing/success', '/billing/canceled', '/contact-sales', '/api/billing/webhook', '/api/contact-sales', '/api/ping', '/api/push/send'];
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
    if (isApiRoute) {
      return apiJson(401, 'Unauthorized', 'Your session has expired. Reload the page and sign in again.');
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && request.nextUrl.pathname === '/login') {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  /**
   * The exclusions covered images and fonts but not .json, .js, .txt or .xml,
   * so four files that must be reachable without a session were being
   * redirected to /login:
   *
   *   /manifest.json   an install prompt cannot read it, so the app has never
   *                    been installable
   *   /sw.js           the worker script itself, so no service worker has ever
   *                    registered — every caching and update mechanism in this
   *                    codebase has been inert
   *   /robots.txt      crawlers received a redirect to a login page
   *   /sitemap.xml     the same
   *
   * These are public by nature: the manifest and worker are fetched by the
   * browser before any session exists, and neither carries tenant data.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)).*)'],
};
