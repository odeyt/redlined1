/**
 * POST /api/whatsapp/automation — the one automated notification: "vehicle
 * ready for pickup", when a job card moves to the `ready` repair stage.
 *
 * Called fire-and-forget by the job card screen after a stage change has
 * already been saved; it can never block or undo that save. It sends ONLY if
 * every one of these is true — otherwise it answers 200 { skipped } quietly:
 *   - the master switch AND "automated notifications" are on (both off by
 *     default; the owner activates them in Settings → Integrations),
 *   - the "ready for pickup" automation is ticked,
 *   - the job's stage, read from the database, is `ready`,
 *   - the customer already opted in (automations never record consent),
 *   - and every gate of a manual send passes (sandbox list, live approval,
 *     approved template, duplicates).
 * A given job stage is sent at most once: the duplicate key is per stage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, sendDeps, NO_STORE } from '@/lib/whatsapp/server';
import { AutomationSchema, LanguageSchema } from '@/lib/whatsapp/schemas';
import { loadConnection, sendDocumentMessage } from '@/lib/whatsapp/sendService';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** Deterministic UUID-shaped id per (job, stage), so a retried call is a replay. */
function requestIdFor(jobId: string, stage: string): string {
  const h = createHash('sha256').update(`auto|${jobId}|${stage}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, AutomationSchema);
  if (!parsed.ok) return parsed.response;
  const { shopId, jobId } = parsed.data;
  const access = await requireWhatsAppAccess(req, shopId, ['owner', 'manager', 'advisor', 'technician']);
  if (!access.ok) return json({ skipped: 'not_available' });
  if (isRateLimited(`wa-auto:${shopId}`, 60, 60_000)) return json({ skipped: 'rate_limited' });

  try {
    const deps = sendDeps();
    const conn = await loadConnection(deps.db, access.shopId);
    if (!conn.ok || !conn.row) return json({ skipped: 'not_connected' });
    const c = conn.row;
    const settings = (c.automation_settings ?? {}) as { jobReadyForPickup?: boolean; language?: string };
    if (!c.enabled || !c.automations_enabled || !settings.jobReadyForPickup) return json({ skipped: 'not_activated' });

    const scope = await deps.scope(access.shopId);
    const { data: job, error } = await deps.db.from('job_cards').select('id, repair_stage').eq('id', jobId).in('shop_id', scope).maybeSingle();
    if (error) throw error;
    if (!job || job.repair_stage !== 'ready') return json({ skipped: 'stage' });

    const lang = LanguageSchema.safeParse(settings.language);
    const out = await sendDocumentMessage(deps, {
      shopId: access.shopId,
      userId: access.context.userId,
      resourceType: 'job',
      resourceId: jobId,
      language: lang.success ? lang.data : 'en',
      clientRequestId: requestIdFor(jobId, 'ready'),
      trigger: 'automated',
    });
    if (!out.ok) return json({ skipped: out.code });
    return json({ sent: true, status: out.message.status, replay: !!out.replay });
  } catch (e) {
    sanitizeError(e, 'whatsapp/automation:POST');
    return json({ skipped: 'error' });
  }
}
