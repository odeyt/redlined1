/**
 * POST /api/diagnostics/bridge/pair
 * Initiate J2534 Bridge pairing. Owner-only. Generates a short-lived pairing code.
 * Requires diagnostic_bridge_enabled flag.
 *
 * The pairing code is returned in plaintext once. Only its hash is stored.
 * The Windows bridge agent uses the code to claim a bridge device credential.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getFlags, getCurrentEnvironment } from '@/lib/featureFlags/featureFlagService';
import { createHash, randomBytes } from 'crypto';

async function getAuthContext(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const shopId = req.headers.get('x-shop-id') ?? cookieStore.get('shopId')?.value ?? '';
  const { data: suRow } = await supabase
    .from('shop_users').select('role').eq('user_id', user.id).eq('shop_id', shopId).maybeSingle();
  return { supabase, user, shopId, role: (suRow as { role?: string } | null)?.role ?? '' };
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getAuthContext(req);
    if (!ctx?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (ctx.role !== 'owner') return NextResponse.json({ error: 'Owner only' }, { status: 403 });

    const flags = await getFlags({ userId: ctx.user.id, shopId: ctx.shopId, role: ctx.role, environment: getCurrentEnvironment() });
    if (!flags['diagnostic_bridge_enabled']) {
      return NextResponse.json({ error: 'Bridge feature is not enabled.' }, { status: 403 });
    }

    // Generate a 8-character alphanumeric pairing code (one-use, 10 min TTL)
    const codeBytes = randomBytes(6);
    const pairingCode = codeBytes.toString('base64url').toUpperCase().slice(0, 8);
    const pairingCodeHash = createHash('sha256').update(pairingCode).digest('hex');
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data, error } = await ctx.supabase
      .from('diagnostic_bridge_pairings')
      .insert({
        shop_id: ctx.shopId,
        requested_by_user_id: ctx.user.id,
        pairing_code: '[REDACTED]',    // never stored in plaintext
        pairing_code_hash: pairingCodeHash,
        expires_at: expiresAt,
        status: 'PENDING',
      })
      .select('id, shop_id, expires_at, status, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Return plaintext code once — never stored
    return NextResponse.json({
      pairingId: data.id,
      pairingCode,           // shown once in the UI for the technician to enter in Windows bridge
      expiresAt,
    }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
