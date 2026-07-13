/**
 * /admin/billing-health — Platform owner only.
 * Uses next/headers cookies() directly (correct Server Component pattern).
 */

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import { BillingHealthDashboard } from '@/features/admin/billing-health/BillingHealthDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing Health — RedlineD1 Admin',
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

export default async function BillingHealthPage() {
  const email = await getSessionEmail();

  const raw = process.env.PLATFORM_OWNER_EMAIL ?? 'admin@redlined1.com';
  const ownerEmails = raw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

  if (!email || !ownerEmails.includes(email)) {
    redirect('/login');
  }

  return <BillingHealthDashboard />;
}
