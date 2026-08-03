import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { getBackupStatus, validateBackup, listRecoveryPoints } from '@/services/backupService';

export async function GET(req: NextRequest) {
  // This reports deployment ids, git branch and commit, migration history and
  // environment-variable checks — the platform's infrastructure, not any
  // shop's data.
  //
  // It was commented "disaster recovery is shop-management level" and gated on
  // shop_users role owner/admin, then fell back to allowing ANY authenticated
  // shop member if that lookup missed. So every customer, technician included,
  // could read our deployment internals.
  //
  // Backups and restores are the platform operator's concern; a shop cannot act
  // on any of this. Same check as the other operator routes.
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) {
    return auth.email ? forbidden(auth.reason)
      : NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [status, validation, recoveryPoints] = await Promise.all([
    getBackupStatus(),
    validateBackup(),
    Promise.resolve(listRecoveryPoints()),
  ]);

  return NextResponse.json({ status, validation, recoveryPoints });
}
