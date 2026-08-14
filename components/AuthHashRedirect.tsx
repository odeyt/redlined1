'use client';

/**
 * Rescues an invite or password-reset that lands on the wrong page.
 *
 * Supabase sends these back with the session in the URL fragment
 * (#access_token=…&type=invite). It is supposed to arrive at
 * /auth/callback — but when the redirect target is not in Supabase's allowed
 * Redirect URLs, Supabase silently falls back to the project's Site URL
 * instead. That is the site root, which for a signed-out visitor renders the
 * marketing page.
 *
 * Observed exactly that: an invited technician tapped Accept Invitation,
 * reached redlined1.com, and was shown the homepage with no way to set a
 * password. The link had worked; the destination had not been allowed.
 *
 * The login page already forwards this fragment. The marketing page did not,
 * so the one page an invited user is most likely to land on was the one that
 * dropped them. Mounting this there makes the invite work regardless of how
 * the allowlist is configured — the configuration should still be right, but
 * a person accepting an invitation should not depend on it.
 *
 * A fragment never reaches the server, so this has to run in the browser.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function AuthHashRedirect() {
  const router = useRouter();

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (!hash) return;

    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const type = params.get('type');

    // Only the flows that mean "this person is mid-signup or mid-reset".
    // Anything else with a fragment is left alone.
    if (accessToken && (type === 'invite' || type === 'recovery')) {
      router.replace('/auth/callback' + window.location.hash);
      return;
    }

    // Supabase reports failures in the fragment too — an expired or reused
    // link arrives as #error=…&error_description=…. Sending that to the
    // callback lets it explain what happened, instead of leaving someone on
    // a marketing page wondering why nothing occurred.
    if (params.get('error')) {
      router.replace('/auth/callback' + window.location.hash);
    }
  }, [router]);

  return null;
}
