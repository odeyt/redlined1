/**
 * Collects the facts the capture's safety gates judge. READ-ONLY.
 *
 * Every query here is a SELECT through the service-role client. Nothing is
 * inserted, updated or deleted, and no row content beyond what a gate needs is
 * read — never a customer's contact details from any shop but the demo shop's
 * exact fictional records.
 *
 * Any query error becomes `null`, which every gate in lib/marketing-capture
 * treats as a failure. That includes `shops.is_synthetic` not existing yet: until
 * the migration is applied, the capture cannot start.
 */
import { readFileSync, existsSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { ALERT_EVENTS, ALERT_ROLES, isAlertEnabled, type AlertPreferences } from '@/lib/alerts/catalogue';
import { DEMO, type GateFacts, type OwnedRecord } from '@/lib/marketing-capture/gates';
import { PRODUCTION_REF } from '../helpers/db-target';

/** The capture is production-only by design, so the project is named, not read from env. */
const SUPABASE_URL = `https://${PRODUCTION_REF}.supabase.co`;
export const DEMO_AUTH_STATE = 'tests/.auth/marketing-demo.json';

function admin() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('[marketing-capture] SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(SUPABASE_URL, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/**
 * The user inside the saved Playwright session, decoded from its access token.
 *
 * @supabase/ssr stores the session in `sb-<ref>-auth-token`, optionally split
 * into `.0`, `.1` chunks and prefixed `base64-`. Only the token's `sub` claim is
 * read; the token itself is never logged or returned.
 */
export function sessionUserIdFromAuthState(path = DEMO_AUTH_STATE): string | null {
  try {
    if (!existsSync(path)) return null;
    const state = JSON.parse(readFileSync(path, 'utf8')) as { cookies?: { name: string; value: string }[] };
    const base = `sb-${PRODUCTION_REF}-auth-token`;
    const parts = (state.cookies ?? [])
      .filter(c => c.name === base || c.name.startsWith(`${base}.`))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (parts.length === 0) return null;
    let raw = parts.map(p => p.value).join('');
    if (raw.startsWith('base64-')) raw = Buffer.from(raw.slice(7), 'base64').toString('utf8');
    const accessToken = (JSON.parse(raw) as { access_token?: string }).access_token;
    const payload = accessToken?.split('.')[1];
    if (!payload) return null;
    const sub = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string }).sub;
    return typeof sub === 'string' ? sub : null;
  } catch {
    return null;
  }
}

/** True only when no alert this shop can raise would reach any role. */
function everyAlertMuted(prefs: AlertPreferences | null | undefined): boolean {
  return ALERT_ROLES.every(role => ALERT_EVENTS.every(e => !isAlertEnabled(prefs, role, e.id)));
}

export async function collectGateFacts(baseUrl: string | undefined): Promise<GateFacts> {
  const db = admin();
  const shopId = process.env.MARKETING_DEMO_SHOP_ID ?? '';
  const sessionUserId = sessionUserIdFromAuthState();

  const facts: GateFacts = {
    env: {
      captureEnabled: process.env.ALLOW_PRODUCTION_MARKETING_CAPTURE,
      demoShopId: process.env.MARKETING_DEMO_SHOP_ID,
      baseUrl,
    },
    shop: null, sessionUserId, sessionMemberships: null, shopMembers: null,
    pushSubscriptions: null, alertsAllOff: null, mirrorRows: null,
    customersNamed: null, vehiclesWithPlate: null, techniciansNamed: null,
    jobCard: null, repairOrder: null, sapeleeOutboxRows: null,
  };
  // The id reaches a PostgREST `or=` filter below. Anything that is not a UUID
  // returns empty facts (every gate fails) instead of being interpolated.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shopId)) return facts;

  const shop = await db.from('shops').select('id, name, is_synthetic').eq('id', shopId).maybeSingle();
  if (!shop.error && shop.data) {
    facts.shop = { id: shop.data.id, name: shop.data.name, isSynthetic: shop.data.is_synthetic === true };
  }

  if (sessionUserId) {
    const m = await db.from('shop_users').select('shop_id, role').eq('user_id', sessionUserId);
    if (!m.error) facts.sessionMemberships = (m.data ?? []).map(r => ({ shopId: r.shop_id, role: r.role }));
  }

  const members = await db.from('shop_users').select('user_id, role').eq('shop_id', shopId);
  if (!members.error) {
    facts.shopMembers = (members.data ?? []).map(r => ({ userId: r.user_id, role: r.role }));
    const userIds = facts.shopMembers.map(r => r.userId);
    // Both ways a device could be reached: by a member's user id, or tagged with the shop.
    const byUser = userIds.length
      ? await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).in('user_id', userIds)
      : { count: 0, error: null };
    const byShop = await db.from('push_subscriptions').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
    if (!byUser.error && !byShop.error && byUser.count !== null && byShop.count !== null) {
      facts.pushSubscriptions = byUser.count + byShop.count;
    }
  }

  const settings = await db.from('shop_settings').select('alert_preferences').eq('shop_id', shopId).maybeSingle();
  if (!settings.error && settings.data) facts.alertsAllOff = everyAlertMuted(settings.data.alert_preferences as AlertPreferences);

  const mirrors = await db.from('shop_mirrors').select('shop_id', { count: 'exact', head: true })
    .or(`shop_id.eq.${shopId},mirror_shop_id.eq.${shopId}`);
  if (!mirrors.error) facts.mirrorRows = mirrors.count;

  // Searched across ALL shops by the exact fictional value, so a collision anywhere is caught.
  const own = (rows: Record<string, unknown>[] | null): OwnedRecord[] =>
    (rows ?? []).map(r => ({
      shopId: String(r.shop_id ?? ''),
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      userId: (r.user_id as string | null) ?? null,
    }));

  const c = await db.from('customers').select('shop_id, phone, email').eq('name', DEMO.customer);
  if (!c.error) facts.customersNamed = own(c.data);
  const v = await db.from('vehicles').select('shop_id').eq('plate', DEMO.plate);
  if (!v.error) facts.vehiclesWithPlate = own(v.data);
  const t = await db.from('technicians').select('shop_id, phone, email, user_id').eq('name', DEMO.technician);
  if (!t.error) facts.techniciansNamed = own(t.data);

  // maybeSingle errors on two rows, which leaves the fact null and fails the gate.
  const jc = await db.from('job_cards').select('status, technicians')
    .eq('shop_id', shopId).eq('customer', DEMO.customer).eq('vehicle', DEMO.vehicleLabel).maybeSingle();
  if (!jc.error && jc.data) {
    facts.jobCard = { status: jc.data.status, technicians: Array.isArray(jc.data.technicians) ? jc.data.technicians : [] };
  }

  const ro = await db.from('repair_orders').select('ro_number, invoice_number, status')
    .eq('shop_id', shopId).eq('ro_number', DEMO.roNumber).maybeSingle();
  if (!ro.error && ro.data) {
    facts.repairOrder = { roNumber: ro.data.ro_number, invoiceNumber: ro.data.invoice_number ?? null, status: ro.data.status };
  }

  const outbox = await db.from('sapelee_event_outbox').select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
  if (!outbox.error) facts.sapeleeOutboxRows = outbox.count;

  return facts;
}
