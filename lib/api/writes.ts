/**
 * API v1 draft writes: request bodies, tenant checks, shop defaults,
 * required idempotency and error mapping (docs/api/PLAN.md phase 4).
 *
 * The bodies are `.strict()`: status, totals, discount, tax_rate, cost,
 * markup, shop_id and anything else not named here is rejected with 422, so a
 * key cannot discover a field that quietly does something.
 */
import { z } from 'zod';
import { ApiError } from './errors';
import { reserveIdempotency, completeReservation, releaseReservation, hashRequest } from './idempotency';
import type { ApiContext } from './handler';
import { createCustomerDomain } from '@/lib/domain/customers';
import { createVehicleDomain } from '@/lib/domain/vehicles';
import { DocumentStateError } from '@/lib/domain/documentQuery';
import { NotPermittedError } from '@/lib/domain/context';
import { SHOP_PRICING_DEFAULTS } from '@/lib/shopPricingDefaults';
import type { DraftLine, DraftPatch } from '@/lib/domain/documentDrafts';

/** The currencies the staff estimate and invoice forms offer (owner Q4). */
export const DOCUMENT_CURRENCIES = ['LAK', 'THB', 'USD'] as const;

/**
 * The D1 shops, whose forms open in THB. Mirrors D1_SHOP_IDS in
 * EstimatesView and InvoicesView; a test fails if they drift.
 */
export const THB_DEFAULT_SHOP_IDS: ReadonlySet<string> = new Set([
  '38d55fae-741b-4bac-b520-f96eed65bf38',
  '90b72748-bf01-4456-999f-f4ba48091606',
]);

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');
const currency = z.enum(DOCUMENT_CURRENCIES);

const line = z.object({
  description: z.string().trim().min(1).max(500),
  lao_description: z.string().trim().max(500).optional(),
  note: z.string().trim().max(500).optional(),
  qty: z.number().finite().positive().max(100_000),
  rate: z.number().finite().min(0).max(1_000_000_000),
  currency: currency.optional(),
}).strict();

const lines = z.array(line).min(1).max(200);

export const estimateCreateBody = z.object({
  customer_id: uuid,
  vehicle_id: uuid.optional(),
  currency: currency.optional(),
  lines,
  notes: z.string().trim().max(2000).optional(),
  valid_until: date.optional(),
}).strict();

export const estimatePatchBody = z.object({
  customer_id: uuid.optional(),
  vehicle_id: uuid.nullable().optional(),
  currency: currency.optional(),
  lines: lines.optional(),
  notes: z.string().trim().max(2000).optional(),
  valid_until: date.nullable().optional(),
}).strict().refine(b => Object.keys(b).length > 0, { message: 'Send at least one field to change.' });

export const invoiceCreateBody = z.object({
  customer_id: uuid,
  vehicle_id: uuid.optional(),
  currency: currency.optional(),
  lines,
  notes: z.string().trim().max(2000).optional(),
  due_date: date.optional(),
}).strict();

export const invoicePatchBody = z.object({
  customer_id: uuid.optional(),
  vehicle_id: uuid.nullable().optional(),
  currency: currency.optional(),
  lines: lines.optional(),
  notes: z.string().trim().max(2000).optional(),
  due_date: date.nullable().optional(),
}).strict().refine(b => Object.keys(b).length > 0, { message: 'Send at least one field to change.' });

export function toDraftLines(input: z.infer<typeof lines>): DraftLine[] {
  return input.map(l => ({
    description: l.description,
    note: l.note ?? '',
    qty: l.qty,
    rate: l.rate,
    ...(l.lao_description ? { laoDescription: l.lao_description } : {}),
    ...(l.currency ? { currency: l.currency } : {}),
  }));
}

export async function readBody<T extends z.ZodTypeAny>(request: Request, schema: T): Promise<z.infer<T>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiError('VALIDATION_FAILED', { reason: 'Body is not valid JSON.' });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError('VALIDATION_FAILED', {
      issues: parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return parsed.data;
}

/**
 * The customer (and vehicle) a draft names, checked against this tenant.
 *
 * Another shop's id is 404 NOT_FOUND, never 403, as everywhere in v1. A
 * vehicle registered to a different customer is refused (422): a bot mixing
 * up two customers' cars is a mistake worth stopping, not storing.
 */
export async function resolveParty(
  ctx: ApiContext,
  customerId: string,
  vehicleId: string | null | undefined,
): Promise<{ customerId: string; customerName: string; vehicle: string | undefined }> {
  const deps = { db: ctx.db, context: ctx.domain };
  const customer = await createCustomerDomain(deps).get(customerId);
  if (!customer) throw new ApiError('NOT_FOUND', { reason: 'customer_id was not found.' });

  if (vehicleId === undefined) return { customerId, customerName: customer.name, vehicle: undefined };
  if (vehicleId === null) return { customerId, customerName: customer.name, vehicle: '' };

  const vehicle = await createVehicleDomain(deps).get(vehicleId);
  if (!vehicle) throw new ApiError('NOT_FOUND', { reason: 'vehicle_id was not found.' });
  if (vehicle.customerId && vehicle.customerId !== customerId) {
    throw new ApiError('VALIDATION_FAILED', { reason: 'That vehicle belongs to a different customer.' });
  }
  return { customerId, customerName: customer.name, vehicle: vehicle.label };
}

/**
 * The tax rate and currency a new draft gets, as the staff forms do it:
 * tax from Settings (default 0, never a guess), currency THB for the D1 shops
 * and USD otherwise unless the key sends one.
 */
export async function shopDraftDefaults(ctx: ApiContext): Promise<{ taxRate: number; currency: string }> {
  const shopId = ctx.domain.shopId;
  const { data } = await ctx.db
    .from('shop_settings')
    .select('default_tax_rate')
    .eq('shop_id', shopId)
    .maybeSingle();
  const raw = Number(data?.default_tax_rate ?? SHOP_PRICING_DEFAULTS.taxRate);
  const taxRate = Number.isFinite(raw) && raw >= 0 && raw < 1 ? raw : SHOP_PRICING_DEFAULTS.taxRate;
  return { taxRate, currency: THB_DEFAULT_SHOP_IDS.has(shopId) ? 'THB' : 'USD' };
}

/** PATCH body → domain patch, with the customer/vehicle resolved in-tenant. */
export async function toDraftPatch(
  ctx: ApiContext,
  body: {
    customer_id?: string; vehicle_id?: string | null; currency?: string;
    lines?: z.infer<typeof lines>; notes?: string; valid_until?: string | null; due_date?: string | null;
  },
  currentCustomerId: string,
): Promise<DraftPatch> {
  const patch: DraftPatch = {};
  if (body.customer_id !== undefined || body.vehicle_id !== undefined) {
    const customerId = body.customer_id ?? currentCustomerId;
    if (!customerId) {
      throw new ApiError('VALIDATION_FAILED', { reason: 'This draft has no customer; send customer_id with vehicle_id.' });
    }
    const party = await resolveParty(ctx, customerId, body.vehicle_id);
    patch.customerId = party.customerId;
    patch.customerName = party.customerName;
    if (party.vehicle !== undefined) patch.vehicle = party.vehicle;
  }
  if (body.currency !== undefined) patch.currency = body.currency;
  if (body.lines !== undefined) patch.lines = toDraftLines(body.lines);
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.valid_until !== undefined) patch.validUntil = body.valid_until ?? '';
  if (body.due_date !== undefined) patch.dueDate = body.due_date ?? '';
  return patch;
}

/** Domain refusals → the stable v1 vocabulary. Anything else propagates. */
export function toApiError(err: unknown): unknown {
  if (err instanceof DocumentStateError) {
    if (err.reason === 'NOT_FOUND') return new ApiError('NOT_FOUND');
    return new ApiError('CONFLICT', { reason: err.message, code: err.reason, ...(err.details ?? {}) });
  }
  if (err instanceof NotPermittedError) return new ApiError('FORBIDDEN', { reason: err.message });
  return err;
}

/**
 * Run a POST once per Idempotency-Key, which these endpoints REQUIRE.
 *
 * A bot that times out and retries must not create a second estimate or bill
 * an estimate twice. The key is reserved before any work (the race-safe
 * pattern customers use); a failure releases it so a corrected retry can
 * proceed; a success is stored and replayed to later retries.
 */
export async function onceForIdempotencyKey(
  ctx: ApiContext,
  endpoint: string,
  hashedInput: unknown,
  work: () => Promise<{ status: number; body: unknown }>,
): Promise<{ status: number; body: unknown; replay: boolean }> {
  const key = (ctx.request.headers.get('idempotency-key') ?? '').trim();
  if (!key) {
    throw new ApiError('VALIDATION_FAILED', { reason: 'The Idempotency-Key header is required for this request.' });
  }
  if (key.length > 255) {
    throw new ApiError('VALIDATION_FAILED', { reason: 'Idempotency-Key must be 255 characters or fewer.' });
  }

  const reservation = await reserveIdempotency(ctx.db, ctx.principal.keyId, endpoint, key, hashRequest(hashedInput));
  if (reservation.mode === 'replay') {
    return { status: reservation.statusCode, body: reservation.body, replay: true };
  }

  let result;
  try {
    result = await work();
  } catch (err) {
    await releaseReservation(ctx.db, ctx.principal.keyId, endpoint, key);
    throw toApiError(err);
  }
  await completeReservation(ctx.db, ctx.principal.keyId, endpoint, key, result.status, result.body);
  return { ...result, replay: false };
}
