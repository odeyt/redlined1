import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Reviewed, scoped compatibility fix for the invite-link flow added in
// app/api/invite/route.ts: `next` is redirected to unauthenticated (right
// after establishing a real session from `code`), so it must be restricted
// to a same-origin local path — never an absolute URL or protocol-relative
// URL (`//evil.com`) that could redirect a freshly-authenticated user off-site.
function isSafeLocalPath(path: string): boolean {
  if (!path.startsWith('/')) return false;
  if (path.startsWith('//')) return false;
  if (path.includes('://')) return false;
  return true;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const error = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') ?? '/';
  const next = isSafeLocalPath(rawNext) ? rawNext : '/';

  if (error || errorCode) {
    const type = errorCode === 'otp_expired' ? 'expired' : 'error';
    return NextResponse.redirect(`${origin}/auth/error?type=${type}`);
  }

  if (code) {
    const cookieStore = await cookies();

    // Collect cookies set during the code exchange so we can attach them to
    // the redirect response — cookies() in GET route handlers must be explicitly
    // forwarded onto the NextResponse, otherwise the browser never receives them.
    const cookiesToSet: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(incoming) {
            incoming.forEach(c => cookiesToSet.push(c));
          },
        },
      }
    );

    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      const response = NextResponse.redirect(`${origin}${next}`);
      // Forward session cookies onto the redirect response
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
      });
      return response;
    }

    console.error('[auth/callback] code exchange failed:', exchangeError.message);
  }

  return NextResponse.redirect(`${origin}/auth/error?type=error`);
}
