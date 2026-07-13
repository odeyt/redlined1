/**
 * /admin/billing-health
 * Server-rendered access gate — verifies platform owner before sending ANY
 * client HTML. Never exposes the dashboard to unauthorized users.
 */

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest } from 'next/server';
import { verifyPlatformOwner } from '@/lib/adminAuth';
import { BillingHealthDashboard } from '@/features/admin/billing-health/BillingHealthDashboard';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Billing Health — RedlineD1 Admin',
  robots: { index: false, follow: false },
};

export default async function BillingHealthPage() {
  // Build a minimal request object from headers so verifyPlatformOwner can
  // read cookies / auth headers in the server component context.
  const headersList = await headers();
  const cookieHeader = headersList.get('cookie') ?? '';
  const authHeader = headersList.get('authorization') ?? '';

  const mockReq = new NextRequest('http://localhost/admin/billing-health', {
    headers: {
      cookie: cookieHeader,
      ...(authHeader ? { authorization: authHeader } : {}),
    },
  });

  const auth = await verifyPlatformOwner(mockReq);

  if (!auth.authorized) {
    // Redirect unauthorized users to login without revealing this route exists
    redirect('/login');
  }

  return <BillingHealthDashboard />;
}
