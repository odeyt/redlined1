/**
 * /admin/sapelee — Platform owner only.
 * Live queue-depth view for the Sapelee event outbox — the "Remaining
 * Risks" item from Phase E Part 1's deployment report: GET
 * /api/sapelee/metrics existed but nothing rendered it, and that route is
 * itself gated by this app's own middleware. This page uses the shared,
 * fail-closed requirePlatformOwnerPage() guard like every other owner-admin
 * page, rather than trying to expose that other route.
 */

import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { SapeleeOutboxDashboard } from '@/features/admin/sapelee/SapeleeOutboxDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Sapelee Outbox — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

export default async function SapeleeOutboxPage() {
  await requirePlatformOwnerPage();
  return <SapeleeOutboxDashboard />;
}
