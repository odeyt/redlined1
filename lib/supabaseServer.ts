import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPA_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPA_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SUPA_SVC  = process.env.SUPABASE_SERVICE_ROLE_KEY;

/** Returns a service-role client (bypasses RLS) when the key is available,
 *  otherwise creates an anon client with the JWT in the Authorization header
 *  so Supabase treats the request as the authenticated user (satisfies RLS). */
export async function getServerDb(jwt?: string): Promise<SupabaseClient> {
  if (SUPA_SVC) return createClient(SUPA_URL, SUPA_SVC);
  if (jwt) {
    return createClient(SUPA_URL, SUPA_ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
  }
  return createClient(SUPA_URL, SUPA_ANON);
}

/** Always returns a service-role client (falls back to anon if key missing).
 *  For public/unauthenticated routes — requires a matching anon RLS policy. */
export function getAdminDb(): SupabaseClient {
  // Read key at call time in case module loaded before env was injected
  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? SUPA_SVC;
  if (!svcKey) {
    console.error('[supabaseServer] SUPABASE_SERVICE_ROLE_KEY not set — using anon key, RLS will block queries');
  }
  return createClient(SUPA_URL, svcKey ?? SUPA_ANON);
}
