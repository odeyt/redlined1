/**
 * /api/whatsapp/connection — the single WhatsApp Business connection of the
 * merged D1 Imports shop.
 *
 * GET    owner/manager/advisor. Everyone gets { available, canSend, mode,
 *        status, enabled } (what the Send buttons need). The owner also gets
 *        the eligibility checklist, template statuses and connection details.
 *        Never a token; never a customer number.
 * PUT    owner. Master switch, automations, attestations, sandbox test
 *        numbers, and sandbox ↔ live mode. Live needs the typed confirmation
 *        phrase, a coexistence connection Meta reports as active, and records
 *        who approved it and when.
 * DELETE owner. Disconnects RedlineD1 only: deletes the stored token and
 *        switches everything off. It does NOT call Meta, does not deregister
 *        the number and does not touch the WhatsApp Business App. Ending
 *        coexistence itself is done by the owner in the app.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, adminDb, NO_STORE } from '@/lib/whatsapp/server';
import { ConnectionQuerySchema, ConnectionUpdateSchema, LIVE_CONFIRMATION_PHRASE } from '@/lib/whatsapp/schemas';
import { buildStatus, FULL_CONNECTION_COLUMNS, type FullConnectionRow, type TemplateRow } from '@/lib/whatsapp/status';
import { serverConfigPresence, metaAppId, embeddedSignupConfigId, graphApiVersion } from '@/lib/whatsapp/config';
import { normalizePhone } from '@/lib/whatsapp/phone';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const check = ConnectionQuerySchema.safeParse({ shopId: req.nextUrl.searchParams.get('shopId') });
  if (!check.success) return json({ error: 'Missing or invalid shopId' }, 400);
  const access = await requireWhatsAppAccess(req, check.data.shopId, ['owner', 'manager', 'advisor']);
  if (!access.ok) return access.response;
  const { shopId } = access;
  const db = adminDb();

  try {
    const { data: row, error } = await db.from('whatsapp_connections').select(FULL_CONNECTION_COLUMNS).eq('shop_id', shopId).maybeSingle();
    if (error) throw error;

    let templates: TemplateRow[] = [];
    let tokenExpiresAt: string | null = null;
    let hasToken = false;
    let sandboxTestPassed = false;
    if (access.context.role === 'owner') {
      const [t, s, m] = await Promise.all([
        db.from('whatsapp_templates').select('name, language, status, rejected_reason, last_synced_at').eq('shop_id', shopId),
        db.from('whatsapp_connection_secrets').select('token_expires_at').eq('shop_id', shopId).maybeSingle(),
        db.from('whatsapp_messages').select('id').eq('shop_id', shopId).eq('mode', 'sandbox').in('status', ['delivered', 'read']).limit(1),
      ]);
      templates = (t.data ?? []) as TemplateRow[];
      hasToken = !!s.data;
      tokenExpiresAt = (s.data?.token_expires_at as string | null) ?? null;
      sandboxTestPassed = (m.data ?? []).length > 0;
    }

    return json(buildStatus({
      role: access.context.role,
      row: row as FullConnectionRow | null,
      templates, tokenExpiresAt, hasToken, sandboxTestPassed,
      server: serverConfigPresence(),
      publicConfig: { appId: metaAppId(), configId: embeddedSignupConfigId(), graphVersion: graphApiVersion() },
    }));
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/connection:GET', 'Could not load the WhatsApp connection') }, 500);
  }
}

export async function PUT(req: NextRequest) {
  const parsed = await parseJsonBody(req, ConnectionUpdateSchema);
  if (!parsed.ok) return parsed.response;
  const { shopId, ...f } = parsed.data;
  const access = await requireWhatsAppAccess(req, shopId, ['owner']);
  if (!access.ok) return access.response;
  const userId = access.context.userId;
  const db = adminDb();

  try {
    const { data: existing, error } = await db.from('whatsapp_connections').select(FULL_CONNECTION_COLUMNS).eq('shop_id', shopId).maybeSingle();
    if (error) throw error;
    const c = existing as FullConnectionRow | null;
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { updated_at: now, updated_by: userId };

    if (f.businessPhone !== undefined) {
      if (f.businessPhone === '') update.business_phone_digits = null;
      else {
        const p = normalizePhone(f.businessPhone);
        if (!p) return json({ error: 'Enter the business number with its country code, e.g. +856 20 5555 1234.' }, 400);
        update.business_phone_digits = p.e164Digits;
      }
    }

    if (f.attestations) {
      update.attestations = { ...(c?.attestations ?? {}), ...f.attestations };
      update.attested_by = userId;
      update.attested_at = now;
    }

    if (f.sandboxRecipients !== undefined) {
      const digits: string[] = [];
      for (const raw of f.sandboxRecipients) {
        const p = normalizePhone(raw);
        if (!p) return json({ error: `Not a valid test number: ${raw.slice(0, 30)}` }, 400);
        if (!digits.includes(p.e164Digits)) digits.push(p.e164Digits);
      }
      update.sandbox_recipients = digits;
    }

    const connected = c?.status === 'connected' && !!c.phone_number_id;

    if (f.enabled !== undefined) {
      if (f.enabled && !connected) return json({ error: 'Connect WhatsApp Business before switching it on.' }, 409);
      update.enabled = f.enabled;
      // Switching the master switch off also stops automations.
      if (!f.enabled) update.automations_enabled = false;
    }

    if (f.automationSettings) {
      update.automation_settings = { ...((c?.automation_settings as Record<string, unknown>) ?? {}), ...f.automationSettings };
    }
    if (f.automationsEnabled !== undefined) {
      const willBeEnabled = f.enabled ?? c?.enabled ?? false;
      if (f.automationsEnabled && (!connected || !willBeEnabled)) {
        return json({ error: 'Switch WhatsApp Business on before activating automated notifications.' }, 409);
      }
      update.automations_enabled = f.automationsEnabled;
    }

    if (f.mode !== undefined && f.mode !== c?.mode) {
      if (f.mode === 'live') {
        if (f.liveConfirmation !== LIVE_CONFIRMATION_PHRASE) {
          return json({ error: `Type ${LIVE_CONFIRMATION_PHRASE} to approve live customer messages.` }, 400);
        }
        if (!c || !connected || c.onboarding_type !== 'coexistence') {
          return json({ error: 'Live mode needs the shop number connected through coexistence onboarding.' }, 409);
        }
        if (c.is_on_biz_app !== true || c.platform_type !== 'CLOUD_API') {
          return json({ error: 'Meta does not report the number on both the Business App and Cloud API. Run Verify connection first.' }, 409);
        }
        update.mode = 'live';
        update.live_approved_by = userId;
        update.live_approved_at = now;
      } else {
        // Back to sandbox revokes the approval; going live again needs a new one.
        update.mode = 'sandbox';
        update.live_approved_by = null;
        update.live_approved_at = null;
      }
    }

    const { error: upErr } = await db.from('whatsapp_connections').upsert({ shop_id: shopId, ...update }, { onConflict: 'shop_id' });
    if (upErr) throw upErr;
    return json({ success: true });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/connection:PUT', 'Could not save WhatsApp settings') }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  const check = ConnectionQuerySchema.safeParse({ shopId: req.nextUrl.searchParams.get('shopId') });
  if (!check.success) return json({ error: 'Missing or invalid shopId' }, 400);
  const access = await requireWhatsAppAccess(req, check.data.shopId, ['owner']);
  if (!access.ok) return access.response;
  const db = adminDb();
  try {
    const now = new Date().toISOString();
    const { error: sErr } = await db.from('whatsapp_connection_secrets').delete().eq('shop_id', access.shopId);
    if (sErr) throw sErr;
    const { error } = await db.from('whatsapp_connections').update({
      status: 'disconnected', enabled: false, automations_enabled: false,
      mode: 'sandbox', live_approved_by: null, live_approved_at: null,
      updated_at: now, updated_by: access.context.userId,
    }).eq('shop_id', access.shopId);
    if (error) throw error;
    return json({ success: true });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/connection:DELETE', 'Could not disconnect') }, 500);
  }
}
