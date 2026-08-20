/**
 * GET  /api/v1/appointments  — list, tenant-scoped, date-filtered, paginated
 * POST /api/v1/appointments  — create, idempotent
 *
 * ## The contract is a wall clock, not an instant
 *
 * `date` and `time` are two text columns holding a shop-local date and a
 * 24-hour time. There is no timestamp anywhere in the model and `shops` has no
 * timezone column, so nothing in Redlined1 knows what zone "10:10" refers to.
 *
 * This API says that plainly rather than dressing it up. Returning
 * "2026-08-21T10:10:00Z" would assert an instant the database does not hold,
 * and returning "+07:00" would hard-code an assumption about where the shop
 * is. A caller that needs an instant must apply the shop's zone itself,
 * knowingly.
 *
 * ## customer, vehicle and technician are text
 *
 * They are display strings a service advisor typed — "SAISAVANH MOTOR",
 * "Audi R8 2008 #6666", "Beck" — not references to the customers, vehicles or
 * technicians tables. There is nothing to resolve and nothing to leak through.
 */
import { z } from 'zod';
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createAppointmentDomain, AppointmentError, type DomainAppointment } from '@/lib/domain/appointments';
import { reserveIdempotency, completeReservation, releaseReservation, hashRequest } from '@/lib/api/idempotency';

const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 25;
const ENDPOINT = 'POST /api/v1/appointments';

const DATE = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.');
const TIME = z.string().trim().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM, 24-hour.');

const createBody = z.object({
  date: DATE,
  time: TIME,
  customer: z.string().trim().max(200).default(''),
  vehicle: z.string().trim().max(200).default(''),
  service: z.string().trim().max(2000).default(''),
  jobCard: z.string().trim().max(100).default(''),
  bay: z.string().trim().max(100).default(''),
  technician: z.string().trim().max(100).default(''),
  reminder: z.string().trim().max(50).optional(),
}).strict();

export function present(a: DomainAppointment) {
  return {
    id: a.id,
    date: a.date,
    time: a.time,
    customer: a.customer,
    vehicle: a.vehicle,
    service: a.service,
    job_card: a.jobCard,
    bay: a.bay,
    technician: a.technician,
    reminder: a.reminder,
  };
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof AppointmentError) {
    return new ApiError('VALIDATION_FAILED', { reason: err.message });
  }
  throw err;
}

export const GET = withApi({ scopes: ['appointments:read'] }, async (ctx: ApiContext) => {
  const url = new URL(ctx.request.url);

  const pageSize = Math.min(
    Math.max(Number(url.searchParams.get('page_size') ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const page = Math.max(Number(url.searchParams.get('page') ?? 1) || 1, 1);

  // Validated, not passed through. An unchecked value would reach a `gte` on a
  // text column and filter by string comparison against nonsense.
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  for (const [name, value] of [['from', from], ['to', to]] as const) {
    if (value !== null && !DATE.safeParse(value).success) {
      throw new ApiError('VALIDATION_FAILED', { reason: '`' + name + '` must look like YYYY-MM-DD.' });
    }
  }

  const status = (url.searchParams.get('reminder') ?? '').trim();
  const technician = (url.searchParams.get('technician') ?? '').trim().toUpperCase();

  const appointments = createAppointmentDomain({ db: ctx.db, context: ctx.domain });
  const all = await appointments.list({ from: from ?? undefined, to: to ?? undefined });

  const filtered = all.filter(a =>
    (!status || a.reminder === status) &&
    (!technician || a.technician.toUpperCase() === technician));

  // The domain orders by date then time; id breaks the remaining tie so a page
  // boundary cannot drop or repeat a row when two share a slot.
  const ordered = [...filtered].sort((a, b) =>
    a.date !== b.date ? a.date.localeCompare(b.date)
      : a.time !== b.time ? a.time.localeCompare(b.time)
        : a.id.localeCompare(b.id));
  const start = (page - 1) * pageSize;

  return apiSuccess(ordered.slice(start, start + pageSize).map(present), ctx.requestId, {
    page, page_size: pageSize, total: ordered.length, has_more: start + pageSize < ordered.length,
    timezone: 'shop-local wall clock; date and time carry no offset',
  });
});

export const POST = withApi(
  { scopes: ['appointments:write'], requiresWriteShop: true },
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

    // Reserve before the work, never check-then-act — the pattern that let
    // three concurrent requests create three vehicles in M13.2.
    if (idempotencyKey) {
      const reservation = await reserveIdempotency(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey, requestHash);
      if (reservation.mode === 'replay') {
        return apiSuccess(reservation.body, ctx.requestId, { idempotent_replay: true }, reservation.statusCode);
      }
    }

    const appointments = createAppointmentDomain({ db: ctx.db, context: ctx.domain });

    let created: DomainAppointment;
    try {
      created = await appointments.create(parsed.data);
    } catch (err) {
      if (idempotencyKey) {
        await releaseReservation(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey);
      }
      throw toApiError(err);
    }

    const body = present(created);
    if (idempotencyKey) {
      await completeReservation(ctx.db, ctx.principal.keyId, ENDPOINT, idempotencyKey, 201, body);
    }
    return apiSuccess(body, ctx.requestId, undefined, 201);
  },
);
