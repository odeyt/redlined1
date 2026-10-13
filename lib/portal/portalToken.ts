/**
 * Customer portal bearer tokens, server side.
 *
 * Tokens live in public.customer_portal_tokens (service role only; see
 * supabase/migrations/2026-10-13_customer_portal_tokens.sql). Nothing here
 * logs a token, puts one in an error, or returns one to a caller that has not
 * already proved it may see that customer.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** 64 lowercase hex characters — the only shape the migration issues. */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

export function isWellFormedPortalToken(token: unknown): token is string {
  return typeof token === 'string' && TOKEN_SHAPE.test(token);
}

export interface PortalCustomerRef {
  id: string;
  shopId: string;
}

/**
 * Raised when the database cannot answer at all (missing table, permission,
 * outage) — as opposed to "no such token". The caller logs it and shows the
 * customer the same "not found" page, so an outage never reveals anything.
 */
export class PortalLookupError extends Error {
  constructor(public readonly stage: string, public readonly code: string | undefined, message: string) {
    super(message);
    this.name = 'PortalLookupError';
  }
}

/**
 * Token → the one customer it belongs to, with their shop. Null for a
 * malformed or unknown token, or a customer with no shop; never distinguishes
 * between those. The format check runs before any query.
 */
export async function resolvePortalCustomer(
  db: SupabaseClient,
  token: unknown,
): Promise<PortalCustomerRef | null> {
  if (!isWellFormedPortalToken(token)) return null;

  const { data: link, error: linkErr } = await db
    .from('customer_portal_tokens')
    .select('customer_id')
    .eq('token', token)
    .maybeSingle();
  if (linkErr) throw new PortalLookupError('token', linkErr.code, linkErr.message);
  if (!link?.customer_id) return null;

  const { data: customer, error: custErr } = await db
    .from('customers')
    .select('id, shop_id')
    .eq('id', link.customer_id as string)
    .maybeSingle();
  if (custErr) throw new PortalLookupError('customer', custErr.code, custErr.message);
  if (!customer?.id || !customer.shop_id) return null;

  return { id: customer.id as string, shopId: customer.shop_id as string };
}

/** Logs a lookup failure without the token. Missing schema gets its own line. */
export function logPortalLookupError(where: string, e: unknown): void {
  if (e instanceof PortalLookupError) {
    // 42P01 undefined_table / PGRST205 table not in schema cache: the token
    // migration has not been applied to this database.
    const missingSchema = e.code === '42P01' || e.code === 'PGRST205' || e.code === '42703';
    console.error(
      `[${where}] ${missingSchema ? 'portal schema missing — apply 2026-10-13_customer_portal_tokens.sql' : 'portal lookup failed'}`,
      { stage: e.stage, code: e.code },
    );
    return;
  }
  console.error(`[${where}] portal lookup failed`, e instanceof Error ? e.message : 'unknown error');
}

/**
 * The token for one customer, creating it if the insert trigger could not.
 * Only for a caller already authorized for that customer's shop.
 */
export async function getOrCreatePortalToken(db: SupabaseClient, customerId: string): Promise<string> {
  const { data: existing, error } = await db
    .from('customer_portal_tokens')
    .select('token')
    .eq('customer_id', customerId)
    .maybeSingle();
  if (error) throw new PortalLookupError('token', error.code, error.message);
  if (existing?.token) return existing.token as string;

  const { data: fresh, error: genErr } = await db.rpc('new_customer_portal_token');
  if (genErr || typeof fresh !== 'string') throw new PortalLookupError('generate', genErr?.code, genErr?.message ?? 'no token');

  // ON CONFLICT DO NOTHING semantics: if another request created one first,
  // read theirs back rather than overwrite a link that may already be shared.
  const { error: insErr } = await db
    .from('customer_portal_tokens')
    .upsert({ customer_id: customerId, token: fresh }, { onConflict: 'customer_id', ignoreDuplicates: true });
  if (insErr) throw new PortalLookupError('insert', insErr.code, insErr.message);

  const { data: final, error: readErr } = await db
    .from('customer_portal_tokens')
    .select('token')
    .eq('customer_id', customerId)
    .single();
  if (readErr || !final?.token) throw new PortalLookupError('reread', readErr?.code, readErr?.message ?? 'missing');
  return final.token as string;
}
