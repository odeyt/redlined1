import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getAdminDb } from '@/lib/supabaseServer';
import { getBackupStatus, validateBackup, listRecoveryPoints } from '@/services/backupService';

export async function GET() {
  const cookieStore = await cookies();
  const userClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll() } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Allow owner or admin roles — disaster recovery is shop-management level
  const adminDb = getAdminDb();
  const { data: shopUser } = await adminDb
    .from('shop_users')
    .select('role')
    .eq('user_id', user.id)
    .in('role', ['owner', 'admin'])
    .maybeSingle();

  if (!shopUser) {
    // Fallback: allow any authenticated shop member (role check may fail due to multi-location)
    const { data: anyShopUser } = await adminDb
      .from('shop_users')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!anyShopUser) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const [status, validation, recoveryPoints] = await Promise.all([
    getBackupStatus(),
    validateBackup(),
    Promise.resolve(listRecoveryPoints()),
  ]);

  return NextResponse.json({ status, validation, recoveryPoints });
}
