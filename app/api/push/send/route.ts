/**
 * POST /api/push/send — deliver an alert to its recipients' devices.
 *
 * Called by a Supabase Database Webhook on INSERT into alert_events, not by a
 * browser. It therefore authenticates with a shared secret rather than a
 * session: there is no user behind the request.
 *
 * Without that secret this endpoint would let anyone on the internet push a
 * notification to a shop's phones, which is both a nuisance and a convincing
 * phishing surface — a notification carrying the shop's own icon.
 *
 * Recipients are resolved the same way the RLS policy does: addressed to a
 * person, to a role, or to the whole shop. That duplication is deliberate and
 * unavoidable — this runs as the service role, which bypasses RLS entirely, so
 * the rule has to be restated rather than inherited. Any change to the policy
 * in 2026-08-13_alert_events.sql has to be mirrored here.
 */
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createServerSupabase } from '@/lib/supabase-server';
import { isAlertEnabled, type AlertPreferences, type AlertRole } from '@/lib/alerts/catalogue';

interface AlertRow {
  id: string;
  shop_id: string;
  event_type: string;
  target_user_id: string | null;
  target_role: string | null;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
}

function configured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.PUSH_WEBHOOK_SECRET,
  );
}

export async function POST(req: NextRequest) {
  if (!configured()) {
    // 503, not 500: nothing is broken, the deployment simply has no keys yet.
    return NextResponse.json({ error: 'Push is not configured' }, { status: 503 });
  }

  // Constant-length compare is overkill for a header nobody can time-probe
  // remotely at useful resolution, but the check itself is not optional.
  const secret = req.headers.get('x-push-secret');
  if (secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: { record?: AlertRow };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  const row = payload.record;
  if (!row?.id || !row.shop_id || !row.event_type) {
    return NextResponse.json({ error: 'Missing alert record' }, { status: 400 });
  }

  webpush.setVapidDetails(
    'mailto:support@redlined1.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const admin = createServerSupabase();

  // Who should hear about this — mirrors the RLS policy on alert_events.
  const { data: members } = await admin
    .from('shop_users')
    .select('user_id, role')
    .eq('shop_id', row.shop_id);

  let recipients = (members ?? []).filter(m => {
    if (row.target_user_id) return m.user_id === row.target_user_id;
    if (row.target_role) return m.role === row.target_role;
    return true;
  });

  // Then the shop's own preferences, so a muted alert stays muted on a phone
  // as well as on screen. Failing to read them leaves everything on, matching
  // the toaster: losing an alert is worse than one somebody muted.
  const { data: settings } = await admin
    .from('shop_settings')
    .select('alert_preferences')
    .eq('shop_id', row.shop_id)
    .maybeSingle();
  const prefs = (settings?.alert_preferences ?? {}) as AlertPreferences;

  recipients = recipients.filter(m =>
    isAlertEnabled(prefs, m.role as AlertRole, row.event_type),
  );

  if (recipients.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', recipients.map(r => r.user_id));

  if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 });

  const notification = JSON.stringify({
    title: row.title,
    body: row.body ?? '',
    // Same subject collapses rather than stacking on the lock screen.
    tag: `${row.entity_type ?? 'alert'}:${row.entity_id ?? row.id}`,
    url: '/',
  });

  let sent = 0;
  const dead: string[] = [];

  await Promise.all(subs.map(async s => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        notification,
      );
      sent += 1;
    } catch (e: unknown) {
      const status = (e as { statusCode?: number })?.statusCode;
      // 404/410 mean the browser threw this subscription away — the app was
      // uninstalled, or permission revoked. Keeping it would mean retrying a
      // dead endpoint on every alert, forever.
      if (status === 404 || status === 410) dead.push(s.id);
      else console.error('[push] send failed:', status, (e as Error)?.message);
    }
  }));

  if (dead.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', dead);
  }

  return NextResponse.json({ ok: true, sent, pruned: dead.length });
}
