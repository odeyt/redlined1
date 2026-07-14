import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase env vars are not yet available, redirect unauthenticated
  // users to login rather than crashing the handler.
  if (!supabaseUrl || !supabaseKey) {
    const publicPaths = ['/login', '/signup', '/help', '/forgot-password', '/reset-password', '/auth/callback', '/landing-preview', '/privacy', '/terms', '/refund-policy', '/billing/success', '/billing/canceled'];
    const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));
    if (!isPublic) {
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

  const publicPaths = ['/login', '/signup', '/help', '/forgot-password', '/reset-password', '/auth/callback', '/landing-preview', '/privacy', '/terms', '/refund-policy', '/billing/success', '/billing/canceled'];
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));
  const isRoot = request.nextUrl.pathname === '/';

  // PKCE invite/recovery: Supabase redirects to site root with ?code=XXX.
  const code = request.nextUrl.searchParams.get('code');
  if (code && !session) {
    const callbackUrl = new URL('/auth/callback', request.url);
    callbackUrl.searchParams.set('code', code);
    return NextResponse.redirect(callbackUrl);
  }

  if (!session && isRoot) {
    return NextResponse.redirect(new URL('/login', request.url));
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
