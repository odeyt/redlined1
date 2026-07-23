import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getOrCreatePrimaryShop, ensureTrialSubscription } from '@/commercial/onboarding/ShopProvisioningService';
import { VALID_PLAN_KEYS, type CommercialPlanKey } from '@/commercial/onboarding/types';

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

// `next` carries `?plan=X&period=Y` for paid-plan signups (see app/signup/page.tsx),
// nested inside its own query string rather than the callback's top-level params.
function parsePlanFromNext(next: string): CommercialPlanKey {
  try {
    const planParam = new URL(next, 'http://localhost').searchParams.get('plan');
    return VALID_PLAN_KEYS.includes(planParam as CommercialPlanKey) ? (planParam as CommercialPlanKey) : null;
  } catch {
    return null;
  }
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

    const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (!exchangeError) {
      // Provision the shop + start the 7-day trial on first confirmed login.
      // Idempotent (see ShopProvisioningService) — safe to call on every
      // callback, including password-recovery round trips for existing users.
      const user = exchangeData?.user;
      if (user) {
        try {
          const metadata = user.user_metadata as { full_name?: string; shop_name?: string } | null;
          const { shopId } = await getOrCreatePrimaryShop(user.id, {
            ownerName: metadata?.full_name,
            shopName: metadata?.shop_name || 'My Shop',
          });
          await ensureTrialSubscription(user.id, shopId, parsePlanFromNext(next));
        } catch (provisionError) {
          // Never block login on provisioning failure — surfaces as a locked
          // dashboard (recoverable) rather than a broken auth flow (not).
          console.error('[auth/callback] shop/trial provisioning failed:', provisionError);
        }
      }

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
