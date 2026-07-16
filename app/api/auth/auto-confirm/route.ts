/**
 * POST /api/auth/auto-confirm
 *
 * Auto-confirms a brand-new user's email server-side so the client can
 * immediately call signInWithPassword() and proceed to Creem checkout without
 * waiting for the confirmation email.
 *
 * Security: only allows confirmation if the account was created < 5 minutes ago.
 * This prevents the endpoint from being used to confirm arbitrary accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: NextRequest) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  let userId: string | undefined;
  try {
    const body = await req.json();
    userId = body?.userId;
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!userId || typeof userId !== 'string') {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: user, error: fetchErr } = await admin.auth.admin.getUserById(userId);
  if (fetchErr || !user?.user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  // Only allow for accounts created in the last 5 minutes
  const createdAt = new Date(user.user.created_at).getTime();
  if (Date.now() - createdAt > 5 * 60 * 1000) {
    return NextResponse.json({ error: 'Account too old for auto-confirm' }, { status: 403 });
  }

  const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });

  if (updateErr) {
    return NextResponse.json({ error: 'Failed to confirm email', detail: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
