/**
 * POST /api/whatsapp/templates — owner only.
 *   action "sync":   read template statuses from Meta for this account.
 *   action "submit": submit RedlineD1's templates (lib/whatsapp/templates.ts)
 *                    to Meta for review, for the chosen languages. Submitting
 *                    messages nobody; Meta reviews and approves or rejects.
 *
 * Templates already known to Meta are not resubmitted.
 */
import { NextRequest, NextResponse } from 'next/server';
import { parseJsonBody, sanitizeError, isRateLimited } from '@/lib/apiHelpers';
import { requireWhatsAppAccess, adminDb, transport, NO_STORE } from '@/lib/whatsapp/server';
import { TemplatesActionSchema } from '@/lib/whatsapp/schemas';
import { syncTemplateStatuses } from '@/lib/whatsapp/connect';
import { decryptToken } from '@/lib/whatsapp/tokenCrypto';
import { TEMPLATES, TEMPLATE_NAMES, buildTemplateSubmission, type TemplateLanguage } from '@/lib/whatsapp/templates';

export const dynamic = 'force-dynamic';
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const parsed = await parseJsonBody(req, TemplatesActionSchema);
  if (!parsed.ok) return parsed.response;
  const { shopId, action } = parsed.data;
  const languages: TemplateLanguage[] = parsed.data.languages ?? ['en'];
  const access = await requireWhatsAppAccess(req, shopId, ['owner']);
  if (!access.ok) return access.response;
  if (isRateLimited(`wa-templates:${shopId}`, 10, 60_000)) return json({ error: 'Too many attempts. Wait a minute.' }, 429);
  const db = adminDb();

  try {
    const [{ data: c, error }, { data: s, error: sErr }] = await Promise.all([
      db.from('whatsapp_connections').select('waba_id, status').eq('shop_id', shopId).maybeSingle(),
      db.from('whatsapp_connection_secrets').select('access_token_enc').eq('shop_id', shopId).maybeSingle(),
    ]);
    if (error || sErr) throw error ?? sErr;
    if (!c?.waba_id || !s?.access_token_enc || c.status !== 'connected') return json({ error: 'Connect WhatsApp Business first.' }, 409);
    const token = decryptToken(s.access_token_enc);
    const t = transport();

    const list = await t.listTemplates({ token, wabaId: c.waba_id });
    if (!list.ok) return json({ error: `Meta: ${list.error.title}` }, 502);
    const synced = await syncTemplateStatuses(db, shopId, list.data, TEMPLATE_NAMES);
    if (!synced.ok) throw synced.error;
    if (action === 'sync') return json({ success: true, synced: synced.count });

    const known = new Set(list.data.map(r => `${r.name}|${r.language}`));
    const results: Array<{ name: string; language: string; status: string; error?: string }> = [];
    const now = new Date().toISOString();
    for (const def of Object.values(TEMPLATES)) {
      for (const lang of languages) {
        if (known.has(`${def.name}|${lang}`)) continue;
        const created = await t.createTemplate({ token, wabaId: c.waba_id, submission: buildTemplateSubmission(def.kind, lang) });
        if (!created.ok) {
          results.push({ name: def.name, language: lang, status: 'ERROR', error: created.error.title });
          continue;
        }
        results.push({ name: def.name, language: lang, status: created.data.status });
        await db.from('whatsapp_templates').upsert({
          shop_id: shopId, name: def.name, language: lang, status: created.data.status, category: def.category,
          meta_template_id: created.data.id, submitted_by: access.context.userId, submitted_at: now, last_synced_at: now,
        }, { onConflict: 'shop_id,name,language' });
      }
    }
    return json({ success: true, submitted: results });
  } catch (e) {
    return json({ error: sanitizeError(e, 'whatsapp/templates:POST', 'Could not update templates') }, 500);
  }
}
