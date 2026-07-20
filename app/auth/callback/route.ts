import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/supabaseServer';

const INTERNAL_SHOP_IDS = new Set([
  '38d55fae-741b-4bac-b520-f96eed65bf38',
  '90b72748-bf01-4456-999f-f4ba48091606',
]);

// Ensure a new user lands on Free Forever.
// Safe to call repeatedly — only patches if plan is still the bad default or unset.
async function ensureFreeProfile(userId: string) {
  try {
    const db = getAdminDb();
    const { data: profile } = await db
      .from('profiles')
      .select('plan, shop_id, billing_status')
      .eq('id', userId)
      .maybeSingle();

    // Skip internal D1 shops — always pro in app logic
    if (profile?.shop_id && INTERNAL_SHOP_IDS.has(profile.shop_id)) return;

    // Skip if already on a paid or free plan set deliberately
    if (profile?.billing_status === 'active' || profile?.billing_status === 'paid') return;
    if (profile?.plan === 'free' && profile?.billing_status === 'free') return;

    // Patch: no profile, or still on bad column default ('starter'), or legacy 'trial' without a date
    const needsPatch =
      !profile ||
      profile.plan === 'starter' ||
      profile.plan === 'trial' ||
      !profile.plan;

    if (!needsPatch) return;

    await db
      .from('profiles')
      .upsert({
        id: userId,
        plan: 'free',
        trial_ends_at: null,
        billing_status: 'free',
      }, { onConflict: 'id' });
  } catch (e) {
    console.error('[auth/callback] ensureFreeProfile failed:', e);
  }
}

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

    const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Ensure new users land on Free Forever before redirecting
      if (sessionData?.user?.id) {
        await ensureFreeProfile(sessionData.user.id);
      }

      const response = NextResponse.redirect(`${origin}${next}`);
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
      });
      return response;
    }

    console.error('[auth/callback] code exchange failed:', exchangeError.message);
  }

  return NextResponse.redirect(`${origin}/auth/error?type=error`);
}
