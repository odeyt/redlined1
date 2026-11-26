/**
 * Settings → API Keys, for the shop OWNER (docs/api/PLAN.md phase 6).
 *
 *   GET    ?shopId=…          the keys that reach this shop, with recent activity
 *   POST   { shopId, name, scopes }   issue a key; the secret is returned ONCE
 *   DELETE { shopId, id }     revoke a key (the row is kept, marked revoked)
 *
 * Owner only (requireShopRole, which verifies the session token itself), and
 * behind the api_v1_documents flag: 404 while it is off for the shop.
 *
 * Keys issued here are always shop-scoped to this shop. The secret is never
 * stored or logged; the response that carries it is no-store. Issuing and
 * revoking are audited as the owner, through the owner's own session, so the
 * audit row names the person.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireShopRole } from '@/lib/serverAuth';
import { getAdminDb } from '@/lib/supabaseServer';
import { isApiFlagOn } from '@/lib/api/flags';
import { generateApiKey, validateIssueKey, toKeyView, activityByKey } from '@/lib/api/keys';
import { writeAuditEvent, AUDIT } from '@/lib/domain/audit';
import { createDomainContext } from '@/lib/domain/context';

export const dynamic = 'force-dynamic';

const HEADERS = { 'Cache-Control': 'private, no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: HEADERS });
const notFound = () => json({ error: 'Not found' }, 404);

/** The owner's session client, so record_audit_event stamps them as actor. */
function ownerDb(req: NextRequest) {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

async function guard(req: NextRequest, shopId: unknown) {
  const auth = await requireShopRole(req, shopId, ['owner']);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const db = getAdminDb();
  if (!(await isApiFlagOn(db, 'api_v1_documents', [shopId as string]))) {
    return { ok: false as const, response: notFound() };
  }
  return { ok: true as const, db, shopId: shopId as string, userId: auth.context.userId };
}

async function audit(req: NextRequest, shopId: string, userId: string, action: string, keyId: string, after: Record<string, unknown>) {
  const context = createDomainContext({ shopId, actor: { type: 'user', userId, role: 'owner' } });
  await writeAuditEvent(ownerDb(req), context, { action, entityType: 'api_client', entityId: keyId, after });
}

export async function GET(req: NextRequest) {
  const g = await guard(req, req.nextUrl.searchParams.get('shopId'));
  if (!g.ok) return g.response;

  try {
    const { data: shop } = await g.db.from('shops').select('organization_id').eq('id', g.shopId).maybeSingle();
    const org = shop?.organization_id as string | undefined;
    if (!org) return json({ keys: [] });

    // Keys that reach this shop: scoped to it, or organization-wide.
    const { data: keys, error } = await g.db
      .from('api_keys')
      .select('id, name, prefix, scopes, shop_id, created_at, last_used_at, revoked_at')
      .eq('organization_id', org)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const reaching = (keys ?? []).filter((k: { shop_id: string | null }) => !k.shop_id || k.shop_id === g.shopId);

    const { data: events } = await g.db
      .from('audit_events')
      .select('action, entity_type, entity_id, created_at, metadata')
      .eq('shop_id', g.shopId)
      .eq('actor_type', 'api')
      .order('created_at', { ascending: false })
      .limit(200);
    const activity = activityByKey((events ?? []) as Record<string, unknown>[]);

    return json({ keys: reaching.map((k: Record<string, unknown>) => toKeyView(k, activity.get(String(k.id)) ?? [])) });
  } catch (e) {
    console.error('[api-keys] list failed', e);
    return json({ error: 'Could not load API keys.' }, 500);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const g = await guard(req, body.shopId);
  if (!g.ok) return g.response;

  const input = validateIssueKey(body);
  if (!input.ok) return json({ error: input.reason }, 422);

  try {
    const { data: shop } = await g.db.from('shops').select('organization_id').eq('id', g.shopId).maybeSingle();
    const org = shop?.organization_id as string | undefined;
    if (!org) return json({ error: 'This shop has no organization, so it cannot hold API keys.' }, 409);

    const { secret, prefix, keyHash } = generateApiKey();
    const { data: row, error } = await g.db
      .from('api_keys')
      .insert({
        organization_id: org, shop_id: g.shopId, name: input.value.name, prefix,
        key_hash: keyHash, scopes: input.value.scopes, created_by_user_id: g.userId,
      })
      .select('id, name, prefix, scopes, shop_id, created_at, last_used_at, revoked_at')
      .single();
    if (error) throw error;

    // A key nobody can account for must not exist: if the audit row cannot be
    // written, the key is revoked before the secret ever leaves.
    try {
      await audit(req, g.shopId, g.userId, AUDIT.apiKeyIssued, String(row.id), {
        name: input.value.name, scopes: input.value.scopes, prefix,
      });
    } catch (auditError) {
      await g.db.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', row.id);
      console.error('[api-keys] audit failed; key revoked', auditError);
      return json({ error: 'The key could not be recorded, so it was not issued. Try again.' }, 500);
    }

    return json({ key: toKeyView(row as Record<string, unknown>), secret }, 201);
  } catch (e) {
    console.error('[api-keys] issue failed', e);
    return json({ error: 'Could not issue the key.' }, 500);
  }
}

export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const g = await guard(req, body.shopId);
  if (!g.ok) return g.response;

  const id = typeof body.id === 'string' ? body.id : '';
  if (!id) return notFound();

  try {
    // Only a key scoped to THIS shop. An organization-wide key reaches other
    // shops too, so it is revoked by an operator, not from one shop's screen.
    const { data, error } = await g.db
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('shop_id', g.shopId)
      .is('revoked_at', null)
      .select('id, name')
      .maybeSingle();
    if (error) throw error;
    if (!data) return notFound();

    try {
      await audit(req, g.shopId, g.userId, AUDIT.apiKeyRevoked, id, { name: data.name });
    } catch (auditError) {
      // The key is already revoked, which is the safe state; say so.
      console.error('[api-keys] revoke audit failed', auditError);
    }
    return json({ ok: true, id });
  } catch (e) {
    console.error('[api-keys] revoke failed', e);
    return json({ error: 'Could not revoke the key.' }, 500);
  }
}
