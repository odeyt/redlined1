// SI-7: Morning Brief Delivery Service
// Infrastructure only. Dashboard channel only for now.
// NO email/SMS/WhatsApp yet — just scaffolding.

import type { BriefDeliveryLog } from './types';

async function getDb() {
  const { getAdminDb } = await import('@/lib/supabaseServer');
  return getAdminDb();
}

export type DeliveryChannel = 'dashboard' | 'email' | 'sms' | 'whatsapp' | 'push';

/**
 * Prepare a delivery entry. Returns the log record (unsaved).
 * Call createDeliveryLog to persist it.
 */
export function prepareDelivery(
  shopId: string,
  briefId: string,
  channel: DeliveryChannel,
  recipientUserId?: string,
  recipientEmail?: string,
): Omit<BriefDeliveryLog, 'id' | 'createdAt'> {
  return {
    shopId,
    morningBriefId:  briefId,
    deliveryChannel: channel,
    recipientUserId: recipientUserId ?? null,
    recipientEmail:  recipientEmail  ?? null,
    status:          'pending',
    sentAt:          null,
    error:           null,
    metadata:        {},
  };
}

/**
 * Persist a delivery log entry to the DB. Fire-and-forget safe.
 */
export async function createDeliveryLog(
  shopId: string,
  briefId: string,
  channel: DeliveryChannel,
  recipientUserId?: string,
): Promise<string | null> {
  try {
    const db = await getDb();
    const { data } = await db.from('brief_delivery_logs').insert({
      shop_id:           shopId,
      morning_brief_id:  briefId,
      delivery_channel:  channel,
      recipient_user_id: recipientUserId ?? null,
      status:            'pending',
    }).select('id').maybeSingle();
    return (data as { id?: string } | null)?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Mark a delivery log as sent.
 */
export async function markDeliverySent(logId: string): Promise<void> {
  try {
    const db = await getDb();
    await db.from('brief_delivery_logs').update({
      status:  'sent',
      sent_at: new Date().toISOString(),
    }).eq('id', logId);
  } catch { /* fail silently */ }
}

/**
 * Mark a delivery log as failed.
 */
export async function markDeliveryFailed(logId: string, error: string): Promise<void> {
  try {
    const db = await getDb();
    await db.from('brief_delivery_logs').update({
      status: 'failed',
      error:  error.slice(0, 500),
    }).eq('id', logId);
  } catch { /* fail silently */ }
}
