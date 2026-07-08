/**
 * GET /api/billing/plans
 * Returns all active commercial plans. Public endpoint (no auth required).
 */

import { NextResponse } from 'next/server';
import { getPlans } from '@/commercial/plans/planManager';

export async function GET() {
  try {
    const plans = getPlans();
    return NextResponse.json({ plans });
  } catch (err) {
    console.error('[/api/billing/plans]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
