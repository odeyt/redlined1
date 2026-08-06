/**
 * /admin/sapelee — Platform owner only.
 * Live queue-depth view for the Sapelee event outbox — the "Remaining
 * Risks" item from Phase E Part 1's deployment report: GET
 * /api/sapelee/metrics existed but nothing rendered it, and that route is
 * itself gated by this app's own middleware. This page follows the
 * billing-health admin page's exact pattern instead of trying to expose
 * that other route.
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { SapeleeOutboxDashboard } from '@/features/admin/sapelee/SapeleeOutboxDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sapelee Outbox — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

async function getSessionEmail(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll(); },
          setAll() {},
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user?.email?.toLowerCase() ?? null;
  } catch {
    return null;
  }
}

export default async function SapeleeOutboxPage() {
  const email = await getSessionEmail();

  const raw = process.env.PLATFORM_OWNER_EMAIL ?? 'admin@redlined1.com';
  const ownerEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (!email || !ownerEmails.includes(email)) {
    redirect('/login');
  }

  return <SapeleeOutboxDashboard />;
}
