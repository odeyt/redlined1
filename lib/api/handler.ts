/**
 * The one place an API v1 request becomes a domain call.
 *
 * Every route goes through here, in this order:
 *
 *   request id → authenticate → rate limit → scope → tenant → domain → audit
 *
 * Routes get a principal and a DomainContext and nothing else. They cannot
 * reach a Supabase client directly, which is what stops the pattern this
 * milestone exists to avoid:
 *
 *   route → service-role client → .update().eq('id', userSuppliedId)
 *
 * The service-role client is used, because an API key is not a Supabase user
 * and has no JWT, so RLS cannot scope anything. Tenant enforcement is
 * therefore entirely the application's job — and it happens in the domain
 * layer, which scopes reads by `context.shopIds` and writes by
 * `context.shopId`, both of which come from the key rather than the request.
 */
import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { getAdminDb } from '@/lib/supabaseServer';
import { createDomainContext, type DomainContext } from '@/lib/domain/context';
import { ApiError, API_ERRORS, type ApiErrorCode } from './errors';
import { resolvePrincipal, requireScope, type ApiPrincipal } from './principal';

/** Requests per key per window. Generous for a workshop integration. */
const RATE_LIMIT = 120;
const RATE_WINDOW_SECONDS = 60;

export interface ApiContext {
  principal: ApiPrincipal;
  /** Built from the principal. A route may not construct its own. */
  domain: DomainContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  requestId: string;
  request: Request;
}

interface Options {
  /** Scopes the caller must hold. Deny by default: an empty list is an error. */
  scopes: string[];
  /** A write needs one unambiguous shop; a read does not. */
  requiresWriteShop?: boolean;
}

export function apiSuccess(data: unknown, requestId: string, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json(
    { data, meta: { request_id: requestId, ...(meta ?? {}) } },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export function apiFailure(code: ApiErrorCode, requestId: string, details?: unknown) {
  const { status, message } = API_ERRORS[code];
  return NextResponse.json(
    { error: { code, message, request_id: requestId, ...(details ? { details } : {}) } },
    { status, headers: { 'x-request-id': requestId } },
  );
}

export function withApi(
  options: Options,
  handler: (ctx: ApiContext) => Promise<NextResponse>,
): (request: Request) => Promise<NextResponse> {
  // Next passes a second argument for dynamic routes; the id is read from the
  // URL instead, so the routes stay identical in shape whether or not they
  // have a path parameter.
  return async (request: Request) => {
    const requestId = randomUUID();

    try {
      if (options.scopes.length === 0) {
        // A route that declares no scope is a route nobody reviewed.
        throw new ApiError('INTERNAL_ERROR');
      }

      const db = getAdminDb();
      const principal = await resolvePrincipal(db, request.headers.get('authorization'));

      // Rate limit AFTER authentication, keyed on the key. Before it, an
      // unauthenticated flood would consume another tenant's budget.
      const { data: count, error: rlError } = await db.rpc('api_rate_limit_hit', {
        p_api_key_id: principal.keyId,
        p_window_seconds: RATE_WINDOW_SECONDS,
      });
      if (!rlError && typeof count === 'number' && count > RATE_LIMIT) {
        throw new ApiError('RATE_LIMITED', { limit: RATE_LIMIT, windowSeconds: RATE_WINDOW_SECONDS });
      }

      for (const scope of options.scopes) requireScope(principal, scope);

      if (options.requiresWriteShop && !principal.writeShopId) {
        throw new ApiError('SHOP_NOT_ACCESSIBLE', {
          reason: 'This key covers several shops, so a write has no unambiguous target. Use a shop-scoped key.',
        });
      }

      const domain = createDomainContext({
        organizationId: principal.organizationId,
        // A read still needs a shopId on the context; the first permitted shop
        // is only a default — every read is scoped by shopIds, not by this.
        shopId: principal.writeShopId ?? principal.shopIds[0],
        shopIds: principal.shopIds,
        actor: { userId: null, type: 'api', role: 'api_key' },
        capabilities: principal.capabilities,
        requestId,
      });

      const response = await handler({ principal, domain, db, requestId, request });

      // Awaited, not fire-and-forget.
      //
      // `void db.from(...).update(...)` looked like a deliberate
      // fire-and-forget and was actually a no-op: a PostgREST builder is a
      // thenable that issues its request only when awaited, so discarding it
      // meant last_used_at was never written. Nothing failed; the column just
      // stayed null, which is indistinguishable from a key nobody uses — the
      // exact question the column exists to answer.
      //
      // Awaiting costs a round trip. Detaching it is not an option on
      // serverless anyway: the function can be frozen the moment the response
      // is returned, so an un-awaited write may simply never happen.
      try {
        await db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', principal.keyId);
      } catch {
        // Recording usage must never fail a request that already succeeded.
      }

      return response;
    } catch (err) {
      if (err instanceof ApiError) return apiFailure(err.code, requestId, err.details);

      // Anything else is ours, not the caller's. The detail goes to the log
      // with the request id so it can be found; the caller gets a code.
      console.error('[api] ' + requestId + ' unhandled', err);
      try {
        const { alertException } = await import('@/lib/observability/alerts');
        alertException('api.v1', err, { requestId });
      } catch { /* reporting must not break the response */ }
      return apiFailure('INTERNAL_ERROR', requestId);
    }
  };
}
