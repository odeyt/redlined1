import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);

  const error = searchParams.get('error');
  const errorCode = searchParams.get('error_code');
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

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
