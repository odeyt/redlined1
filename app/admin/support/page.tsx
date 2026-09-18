/**
 * /admin/support — Platform owner only. Questions, reported issues, and
 * billing exceptions across every shop. A Server Component: the "needs
 * attention only" toggle is a plain URL searchParam, driven by a <Link>.
 */
import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { listSupportItems } from '@/lib/admin/supportData';
import { SupportIssuesView } from '@/features/admin/support/SupportIssuesView';
import { firstParam, type RawSearchParams } from '@/features/admin/shared/queryString';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Support & Issues — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  await requirePlatformOwnerPage();
  const sp = await searchParams;
  const attentionOnly = firstParam(sp.attention) === '1';

  const data = await listSupportItems();
  return <SupportIssuesView data={data} attentionOnly={attentionOnly} />;
}
