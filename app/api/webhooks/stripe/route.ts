/**
 * POST /api/webhooks/stripe — PLACEHOLDER
 *
 * Wire this up when activating the Stripe provider.
 * The route exists now so DNS/Stripe dashboard config can be set up in advance.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  return NextResponse.json(
    { error: 'Stripe webhooks are not yet enabled. Set PAYMENT_PROVIDER=creem.' },
    { status: 501 },
  );
}
