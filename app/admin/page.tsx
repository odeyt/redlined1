/**
 * /admin — Platform owner overview. A Server Component: the guard and the
 * data read both happen on the server before any HTML is sent, with no
 * client-side fetch — see features/admin/overview/OwnerOverviewView.tsx.
 */
import { requirePlatformOwnerPage } from '@/lib/adminAuth';
import { getOwnerOverview, getBillingReconciliation } from '@/lib/admin/accountsData';
import { listSupportItems } from '@/lib/admin/supportData';
import { getProfileDiagnostics } from '@/lib/admin/profileDiagnostics';
import { buildTodaysActions, supportSummaryForToday } from '@/lib/admin/todaysActions';
import { OwnerOverviewView } from '@/features/admin/overview/OwnerOverviewView';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Owner Admin — RedlineD1',
  robots: { index: false, follow: false },
};

export default async function OwnerAdminPage() {
  await requirePlatformOwnerPage();
  const [overview, reconciliation, support, diagnostics] = await Promise.all([
    getOwnerOverview(),
    getBillingReconciliation({}),
    // Auxiliary panels: a failure here must never take the overview down.
    listSupportItems().then(supportSummaryForToday).catch(() => null),
    getProfileDiagnostics().then(r => r.summary).catch(() => null),
  ]);
  const today = buildTodaysActions({ overview, support, diagnostics });
  return <OwnerOverviewView overview={overview} reconciliation={reconciliation} today={today} diagnostics={diagnostics} />;
}
