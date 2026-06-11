import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  const publicPaths = ['/login', '/signup', '/portal', '/help', '/forgot-password', '/reset-password'];
  const isPublic = publicPaths.some(p => request.nextUrl.pathname.startsWith(p));
  const isRoot = request.nextUrl.pathname === '/';

  // Unauthenticated visitors at / → landing page
  if (!session && isRoot) {
    return NextResponse.redirect(new URL('/portal', request.url));
  }

  // If not logged in and not on a public page, redirect to login
  if (!session && !isPublic) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // If logged in and on the login or portal page, redirect to dashboard
  if (session && (request.nextUrl.pathname === '/login' || request.nextUrl.pathname === '/portal')) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)).*)'],
};
