/**
 * GET   /api/v1/vehicles/:id
 * PATCH /api/v1/vehicles/:id
 *
 * A vehicle belonging to another tenant returns 404, matching the customers
 * slice: 403 would confirm the id is real and let an integration enumerate a
 * competitor's fleet.
 *
 * PATCH is included because the update rules ported cleanly — the domain owns
 * field whitelisting, VIN normalisation and the customer-ownership check, and
 * shop_id is not among the fields it will write. Relocating a vehicle between
 * branches stays where it already was, in a separate deliberate transfer.
 */
import { z } from 'zod';
import { withApi, apiSuccess, type ApiContext } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { createVehicleDomain, type DomainVehicle } from '@/lib/domain/vehicles';
import { present, toApiError } from '../route';

const patchBody = z.object({
  label: z.string().trim().min(1).max(200).optional(),
  customerId: z.string().trim().max(100).nullable().optional(),
  vin: z.string().trim().max(32).optional(),
  plate: z.string().trim().max(30).optional(),
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(60).optional(),
  year: z.string().trim().max(10).optional(),
  fuelType: z.string().trim().max(30).optional(),
  trim: z.string().trim().max(60).optional(),
  engine: z.string().trim().max(60).optional(),
  transmission: z.string().trim().max(60).optional(),
  mileage: z.string().trim().max(20).optional(),
  status: z.string().trim().max(40).optional(),
  recommendation: z.string().trim().max(1000).optional(),
}).strict();

function idFrom(request: Request): string {
  return new URL(request.url).pathname.split('/').filter(Boolean).pop() ?? '';
}

export const GET = withApi({ scopes: ['vehicles:read'] }, async (ctx: ApiContext) => {
  const id = idFrom(ctx.request);
  if (!id) throw new ApiError('NOT_FOUND');

  const vehicles = createVehicleDomain({ db: ctx.db, context: ctx.domain });
  const vehicle = await vehicles.get(id);
  if (!vehicle) throw new ApiError('NOT_FOUND');

  return apiSuccess(present(vehicle), ctx.requestId);
});

export const PATCH = withApi(
  { scopes: ['vehicles:write'], requiresWriteShop: true },
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

    const vehicles = createVehicleDomain({ db: ctx.db, context: ctx.domain });

    // Existence is checked through the tenant-scoped read first, so a foreign
    // id is a 404 before any update is attempted rather than an update that
    // silently matches nothing.
    const existing = await vehicles.get(id);
    if (!existing) throw new ApiError('NOT_FOUND');

    let updated: DomainVehicle;
    try {
      updated = await vehicles.patch(id, parsed.data);
    } catch (err) {
      throw toApiError(err);
    }

    return apiSuccess(present(updated), ctx.requestId);
  },
);
