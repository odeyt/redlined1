/**
 * GET /api/admin/billing-health/unresolved
 * Platform-owner only. Read-only list of Creem subscription events that could not be linked to a shop, with a
 * masked reference and the reason; never the payload, an email or a customer id.
 *
 * These are the same events Billing Health counts as "failed" (error set, not processed). This route is how the
 * owner finds out WHICH ones and why. It changes nothing: see lib/billing/unresolvedEvents.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyPlatformOwner, forbidden } from '@/lib/adminAuth';
import { listUnresolvedBillingEvents } from '@/lib/billing/unresolvedEvents';
import { sanitizeError } from '@/lib/apiHelpers';

export async function GET(req: NextRequest) {
  const auth = await verifyPlatformOwner(req);
  if (!auth.authorized) return forbidden(auth.reason);

  try {
    return NextResponse.json(await listUnresolvedBillingEvents());
  } catch (err) {
    return NextResponse.json({ error: sanitizeError(err, 'admin/billing-health/unresolved') }, { status: 500 });
  }
}
