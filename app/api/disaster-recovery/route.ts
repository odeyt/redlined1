import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/supabaseServer';
import { getBackupStatus, validateBackup, listRecoveryPoints } from '@/services/backupService';

export async function GET() {
  const supabase = getAdminDb();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const [status, validation, recoveryPoints] = await Promise.all([
    getBackupStatus(),
    validateBackup(),
    Promise.resolve(listRecoveryPoints()),
  ]);

  return NextResponse.json({ status, validation, recoveryPoints });
}
