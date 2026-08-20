/**
 * GET  /api/v1/customers  — list, tenant-scoped, paginated
 * POST /api/v1/customers  — create, idempotent
 *
 * Customers first, deliberately: nothing here moves money, so a mistake in the
 * auth or tenancy layer costs a leaked contact record rather than a wrong
 * ledger entry. Everything the financial endpoints will need — principals,
 * scopes, tenant resolution, validation, idempotency, audit — is exercised on
 * a resource where the blast radius is small.
 */
import { z } from 'zod';
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createCustomerDomain } from '@/lib/domain/customers';
import { reserveIdempotency, completeReservation, releaseReservation, hashRequest } from '@/lib/api/idempotency';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;

/**
 * What an API caller may set. Deliberately NOT the domain input type.
 *
 * `.strict()` is the mass-assignment defence: an unknown field is rejected
 * rather than ignored, so a caller cannot discover that sending `shop_id` or
 * `archived_at` does something. Tenancy comes from the key; there is no field
 * here that could redirect it.
 */
const createBody = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(['Individual', 'Business']).default('Individual'),
  phone: z.string().trim().max(50).default(''),
  email: z.string().trim().email().max(200).or(z.literal('')).default(''),
  address: z.string().trim().max(500).default(''),
  tags: z.array(z.string().trim().max(50)).max(20).default([]),
  followUp: z.string().trim().max(500).default(''),
}).strict();

/**
 * The public shape.
 *
 * portalToken is deliberately absent. It is the credential a customer uses to
 * reach their own portal link, and an integration has no business reading it.
 */
function present(c: {
  id: string; name: string; type: string; phone: string; email: string;
  address: string; tags: string[]; followUp: string; archivedAt?: string | null;
}) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    phone: c.phone,
    email: c.email,
    address: c.address,
    tags: c.tags,
    follow_up: c.followUp,
    archived: Boolean(c.archivedAt),
  };
}

export const GET = withApi({ scopes: ['customers:read'] }, async (ctx: ApiContext) => {
  const url = new URL(ctx.request.url);

  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Number(url.searchParams.get('page') ?? 1) || 1, 1);

  const customers = createCustomerDomain({ db: ctx.db, context: ctx.domain });
  // The domain scopes this by context.shopIds, which came from the key.
  const all = await customers.list();

  // Ordering is by name inside the domain; the id break makes it total, so a
  // page boundary cannot drop or repeat a row when two customers share a name.
  const ordered = [...all].sort((a, b) => (a.name === b.name ? a.id.localeCompare(b.id) : a.name.localeCompare(b.name)));
  const start = (page - 1) * pageSize;
  const slice = ordered.slice(start, start + pageSize);

  return apiSuccess(slice.map(present), ctx.requestId, {
    page, page_size: pageSize, total: ordered.length, has_more: start + pageSize < ordered.length,
  });
});

export const POST = withApi(
  { scopes: ['customers:write'], requiresWriteShop: true },
  async (ctx: ApiContext) => {
    let raw: unknown;
    try {
      raw = await ctx.request.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', { reason: 'Body is not valid JSON.' });
    }

    const parsed = createBody.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const idempotencyKey = ctx.request.headers.get('idempotency-key');
    const requestHash = hashRequest(parsed.data);

    // Reserve BEFORE creating. M13.1 checked first and created after, which
    // left the same race the vehicles matrix demonstrated: three concurrent
    // requests with one key all found nothing and all created a record. The
    // unique index now decides the winner before any work happens.
    const ENDPOINT = 'POST /api/v1/customers';
    if (idempotencyKey) {
      const reservation = await reserveIdempotency(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey, requestHash);
      if (reservation.mode === 'replay') {
        return apiSuccess(reservation.body, ctx.requestId, { idempotent_replay: true }, reservation.statusCode);
      }
    }

    const customers = createCustomerDomain({ db: ctx.db, context: ctx.domain });

    let created;
    try {
      // The domain writes shop_id from context.shopId and writes the audit row.
      created = await customers.create(parsed.data);
    } catch (err) {
      if (idempotencyKey) {
        await releaseReservation(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey);
      }
      throw err;
    }

    const body = present(created);
    if (idempotencyKey) {
      await completeReservation(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey, 201, body);
    }

    return apiSuccess(body, ctx.requestId, undefined, 201);
  },
);
