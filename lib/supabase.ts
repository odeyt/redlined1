import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export function getSupabase() {
  return createClient();
}

// Named export for backward compatibility — creates a fresh client on each import
// Do NOT call at module level in server components or API routes
export const supabase = createClient();
