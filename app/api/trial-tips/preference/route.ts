/**
 * The signed-in person's own trial-tips preference, for Settings.
 *
 *   GET   { status: 'subscribed' | 'unsubscribed' | 'suppressed' | 'none' }
 *   POST  { subscribed: boolean } → the new status
 *
 * The person is taken from the bearer token only — never from the body — so
 * nobody can change another person's preference. A suppressed address (it
 * bounced or complained) cannot be switched back on here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase-server';
import { subscribeFromSettings, unsubscribe } from '@/lib/trialTips/consent';
import { TRIAL_TIPS_CONSENT_TEXT } from '@/lib/trialTips/config';

async function callerId(req: NextRequest): Promise<string | null> {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await anon.auth.getUser(token);
  return data.user?.id ?? null;
}

async function currentStatus(userId: string): Promise<string> {
  const { data, error } = await createServerSupabase()
    .from('trial_tip_subscriptions').select('status').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.status as string) ?? 'none';
}

export async function GET(req: NextRequest) {
  const userId = await callerId(req);
  if (!userId) return NextResponse.json({ error: 'Sign in to see this preference.' }, { status: 401 });
  try {
    return NextResponse.json({ status: await currentStatus(userId), consentText: TRIAL_TIPS_CONSENT_TEXT });
  } catch {
    return NextResponse.json({ error: 'Could not load your email preference.' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await callerId(req);
  if (!userId) return NextResponse.json({ error: 'Sign in to change this preference.' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const subscribed = (body as { subscribed?: unknown })?.subscribed;
  if (typeof subscribed !== 'boolean') return NextResponse.json({ error: 'Send { "subscribed": true | false }.' }, { status: 400 });

  try {
    const db = createServerSupabase();
    if (subscribed) {
      const result = await subscribeFromSettings(db, userId);
      if (result === 'suppressed') {
        return NextResponse.json({
          status: 'suppressed',
          error: 'Emails to your address bounced or were reported, so trial tips cannot be switched back on. Contact admin@redlined1.com if that was a mistake.',
        }, { status: 409 });
      }
      if (result === 'unverified') {
        return NextResponse.json({ error: 'Verify your email address first.' }, { status: 409 });
      }
    } else {
      await unsubscribe(db, userId, 'settings');
    }
    return NextResponse.json({ status: await currentStatus(userId) });
  } catch {
    return NextResponse.json({ error: 'Could not save your email preference.' }, { status: 500 });
  }
}
