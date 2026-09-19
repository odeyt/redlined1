/**
 * /admin/billing-health — Platform owner only.
 * Guarded by the shared, fail-closed requirePlatformOwnerPage() — the same
 * PLATFORM_OWNER_EMAIL check every other owner-admin page uses. If that
 * variable is not configured, nobody gets in. The matching /api/admin/
 * billing-health/* routes authorize independently via verifyPlatformOwner().
 */

import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { BillingHealthDashboard } from '@/features/admin/billing-health/BillingHealthDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing Health — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

export default async function BillingHealthPage() {
  await requirePlatformOwnerPage();
  return <BillingHealthDashboard />;
}
