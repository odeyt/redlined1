/**
 * /admin/support — Platform owner only. Questions, reported issues, and
 * billing exceptions across every shop. A Server Component: the filter is a
 * plain URL searchParam, driven by <Link>s. Predicates: lib/admin/supportTriage.ts.
 */
import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { listSupportItems } from '@/lib/admin/supportData';
import { sanitizeSupportView } from '@/lib/admin/supportTriage';
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
  // `attention=1` is the older "needs attention only" link; it still works.
  const view = sanitizeSupportView(firstParam(sp.view), firstParam(sp.attention));

  const data = await listSupportItems();
  return <SupportIssuesView data={data} view={view} />;
}
