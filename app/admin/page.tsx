/**
 * /admin — Platform owner overview. A Server Component: the guard and the
 * data read both happen on the server before any HTML is sent, with no
 * client-side fetch — see features/admin/overview/OwnerOverviewView.tsx.
 */
import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { getOwnerOverview } from '@/lib/admin/accountsData';
import { OwnerOverviewView } from '@/features/admin/overview/OwnerOverviewView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Owner Admin — RedlineD1',
  robots: { index: false, follow: false },
};

export default async function OwnerAdminPage() {
  await requirePlatformOwnerPage();
  const overview = await getOwnerOverview();
  return <OwnerOverviewView overview={overview} />;
}
