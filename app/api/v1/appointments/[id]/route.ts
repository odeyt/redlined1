/**
 * GET   /api/v1/appointments/:id
 * PATCH /api/v1/appointments/:id
 *
 * A foreign appointment returns 404, matching customers and vehicles.
 *
 * PATCH carries no status-transition rules because Redlined1 has none. The
 * `reminder` column holds "Checked in" and "None" in the data and defaults to
 * "Confirmed" in the old service — three values from two sources, with no
 * transitions defined in any code path. It is a marker a human sets, not a
 * lifecycle, and a transition engine invented here would be a new rule wearing
 * the clothes of an existing one.
 *
 * Rescheduling is therefore just a field change: send `date` and `time`.
 */
import { z } from 'zod';
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createAppointmentDomain, type DomainAppointment } from '@/lib/domain/appointments';
import { present, toApiError } from '../route';

const patchBody = z.object({
  date: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD.').optional(),
  time: z.string().trim().regex(/^\d{2}:\d{2}$/, 'Expected HH:MM, 24-hour.').optional(),
  customer: z.string().trim().max(200).optional(),
  vehicle: z.string().trim().max(200).optional(),
  service: z.string().trim().max(2000).optional(),
  jobCard: z.string().trim().max(100).optional(),
  bay: z.string().trim().max(100).optional(),
  technician: z.string().trim().max(100).optional(),
  reminder: z.string().trim().max(50).optional(),
}).strict();

function idFrom(request: Request): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
}

export const GET = withApi({ scopes: ['appointments:read'] }, async (ctx: ApiContext) => {
  const id = idFrom(ctx.request);
  if (!id) throw new ApiError('NOT_FOUND');

  const appointments = createAppointmentDomain({ db: ctx.db, context: ctx.domain });
  const appointment = await appointments.get(id);
  if (!appointment) throw new ApiError('NOT_FOUND');

  return apiSuccess(present(appointment), ctx.requestId, {
    timezone: 'shop-local wall clock; date and time carry no offset',
  });
});

export const PATCH = withApi(
  { scopes: ['appointments:write'], requiresWriteShop: true },
  async (ctx: ApiContext) => {
    const id = idFrom(ctx.request);
    if (!id) throw new ApiError('NOT_FOUND');

    let raw: unknown;
    try {
      raw = await ctx.request.json();
    } catch {
      throw new ApiError('VALIDATION_FAILED', { reason: 'Body is not valid JSON.' });
    }

    const parsed = patchBody.safeParse(raw);
    if (!parsed.success) {
      throw new ApiError('VALIDATION_FAILED', {
        issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    const appointments = createAppointmentDomain({ db: ctx.db, context: ctx.domain });

    // Tenant-scoped existence check first, so a foreign id is a 404 rather
    // than an update that silently matches nothing.
    const existing = await appointments.get(id);
    if (!existing) throw new ApiError('NOT_FOUND');

    let updated: DomainAppointment;
    try {
      updated = await appointments.patch(id, parsed.data);
    } catch (err) {
      throw toApiError(err);
    }

    return apiSuccess(present(updated), ctx.requestId);
  },
);
