/**
 * Server-side Supabase client — uses the SERVICE ROLE key.
 * ⚠️  Import this ONLY in Server Components or Route Handlers.
 *     Never import it in client components or browser code.
 *
 * The service role bypasses RLS, which is intentional for:
 *  • Customer portal  (reads across tables for a verified portal_token)
 *  • Server-side data migrations / seeding
 */
import { createClient } from '@supabase/supabase-js';

export function createServerSupabase() {
  const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars.'
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
