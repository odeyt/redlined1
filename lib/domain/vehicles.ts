/**
 * Vehicles, callable from anywhere.
 *
 * Ported from services/vehicleService.ts, which reaches for the browser
 * Supabase singleton and the client-side shop store — neither of which exists
 * in a route handler. This owns the rules; the service becomes a caller.
 *
 * ## What the data actually says
 *
 * Measured against the 109 vehicles in production before writing a line of
 * this, because the rules that matter here are the ones already in the data:
 *
 *   - 15 vehicles have NO customer. A vehicle can exist unowned.
 *   - 15 have NO VIN, one has 16 characters and one has 22. The 17-character
 *     VIN is the norm, not a rule — classic and import work is real here.
 *   - 8 VINs are duplicated across the estate and 6 of those collide inside a
 *     single shop. A duplicate-VIN insert is accepted by the database today.
 *   - 9 plates are duplicated.
 *
 * So this module normalises a VIN and refuses an obviously malformed one, and
 * does NOT enforce uniqueness. Adding that constraint would reject records the
 * business already holds and turn a working screen into an error. If VIN
 * uniqueness is ever wanted it is a data cleanup first and a constraint
 * second, in that order, and not a side effect of building an API.
 *
 * ## Tenancy
 *
 * Reads span `context.shopIds` — a two-location owner sees both. Writes land
 * in `context.shopId`, exactly one. Neither is ever taken from caller input.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';

export interface DomainVehicle {
  id: string;
  customerId: string | null;
  vin: string;
  label: string;
  trim: string;
  engine: string;
  transmission: string;
  mileage: string;
  plate: string;
  status: string;
  recommendation: string;
  make: string;
  model: string;
  year: string;
  fuelType: string;
  shopId: string;
}

export interface VehicleInput {
  customerId?: string | null;
  vin?: string;
  label: string;
  trim?: string;
  engine?: string;
  transmission?: string;
  mileage?: string;
  plate?: string;
  status?: string;
  recommendation?: string;
  make?: string;
  model?: string;
  year?: string;
  fuelType?: string;
}

export class VehicleError extends Error {
  readonly reason: 'VIN_INVALID' | 'CUSTOMER_NOT_FOUND' | 'INVALID';
  constructor(reason: 'VIN_INVALID' | 'CUSTOMER_NOT_FOUND' | 'INVALID', message: string) {
    super(message);
    this.name = 'VehicleError';
    this.reason = reason;
  }
}

/**
 * The status a vehicle starts in.
 *
 * The old service used 'Active' on create and 'No open jobs' on update, so a
 * vehicle silently changed status the first time anyone edited it. Seven
 * distinct statuses exist in the data. This picks the create value and leaves
 * update alone unless a status is supplied.
 */
export const DEFAULT_VEHICLE_STATUS = 'Active';

/**
 * Trim and upper-case. Nothing else.
 *
 * Not stripping spaces or "correcting" characters: a VIN read off a scanner or
 * a windscreen can contain an ambiguous 0/O or 1/I, and quietly rewriting one
 * produces a record that looks right and matches nothing. A human decides.
 */
export function normalizeVin(vin: string | null | undefined): string {
  return (vin ?? '').trim().toUpperCase();
}

/**
 * Whether a VIN is storable.
 *
 * Empty is allowed — 15 vehicles have none, and refusing would block the
 * no-VIN intake the product supports. Length is capped rather than fixed at
 * 17, because a 16 and a 22 already exist and rejecting them would make those
 * records uneditable. What IS refused is a value containing characters a VIN
 * cannot have, which is the case that indicates a paste of the wrong field.
 */
export function vinProblem(vin: string): string | null {
  if (vin === '') return null;
  if (vin.length > 32) return 'A VIN cannot be longer than 32 characters.';
  if (!/^[A-Z0-9-]+$/.test(vin)) return 'A VIN may only contain letters, digits and hyphens.';
  return null;
}

function mapRow(row: Record<string, unknown>): DomainVehicle {
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    id: s(row.id),
    customerId: (row.customer_id as string) ?? null,
    vin: s(row.vin),
    label: s(row.label),
    trim: s(row.trim),
    engine: s(row.engine),
    transmission: s(row.transmission),
    mileage: s(row.mileage),
    plate: s(row.plate),
    status: s(row.status),
    recommendation: s(row.recommendation),
    make: s(row.make),
    model: s(row.model),
    year: s(row.year),
    fuelType: s(row.fuel_type),
    shopId: s(row.shop_id),
  };
}

/** What an audit row keeps. Enough to answer "which vehicle, whose, and what changed". */
function auditView(v: DomainVehicle): Record<string, unknown> {
  return {
    label: v.label, vin: v.vin, plate: v.plate, customerId: v.customerId,
    make: v.make, model: v.model, year: v.year, status: v.status, mileage: v.mileage,
  };
}

export function createVehicleDomain({ db, context }: DomainDeps) {
  /**
   * Confirm a customer is one this caller may attach a vehicle to.
   *
   * Scoped to context.shopIds, so a customer id belonging to another tenant
   * comes back empty and is reported as not found. The service-role client
   * would happily return any customer in the database if asked globally —
   * this is the reason it is never asked globally.
   */
  async function assertCustomerInTenant(customerId: string): Promise<void> {
    const { data, error } = await db
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw new VehicleError('CUSTOMER_NOT_FOUND', 'No such customer.');
    }
  }

  async function list(): Promise<DomainVehicle[]> {
    const { data, error } = await db
      .from('vehicles')
      .select('*')
      .in('shop_id', context.shopIds)
      .order('label');
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async function get(id: string): Promise<DomainVehicle | null> {
    const { data, error } = await db
      .from('vehicles')
      .select('*')
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async function create(input: VehicleInput): Promise<DomainVehicle> {
    requireCapability(context, 'vehicles.manage', 'add vehicles');

    const label = (input.label ?? '').trim();
    if (!label) throw new VehicleError('INVALID', 'A vehicle needs a label.');

    const vin = normalizeVin(input.vin);
    const problem = vinProblem(vin);
    if (problem) throw new VehicleError('VIN_INVALID', problem);

    const customerId = (input.customerId ?? '') || null;
    if (customerId) await assertCustomerInTenant(customerId);

    const { data, error } = await db
      .from('vehicles')
      .insert({
        shop_id: context.shopId,
        customer_id: customerId,
        vin,
        label,
        trim: input.trim ?? '',
        engine: input.engine ?? '',
        transmission: input.transmission ?? '',
        mileage: input.mileage ?? '',
        plate: (input.plate ?? '').trim(),
        status: input.status || DEFAULT_VEHICLE_STATUS,
        recommendation: input.recommendation ?? '',
        make: input.make ?? null,
        model: input.model ?? null,
        year: input.year ?? null,
        fuel_type: input.fuelType ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    const vehicle = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.vehicleCreated,
      entityType: 'vehicle',
      entityId: vehicle.id,
      after: auditView(vehicle),
    });
    return vehicle;
  }

  /**
   * Update the fields a caller may change.
   *
   * shop_id is absent on purpose. Moving a vehicle between locations is what
   * services/vehicleService.transferVehicle does, deliberately and separately;
   * folding it into a general update would let a routine edit relocate a
   * vehicle to another branch by accident.
   */
  async function patch(id: string, fields: Partial<VehicleInput>): Promise<DomainVehicle> {
    requireCapability(context, 'vehicles.manage', 'edit vehicles');

    const before = await get(id);
    if (!before) throw new VehicleError('INVALID', 'No such vehicle.');

    const payload: Record<string, unknown> = {};
    if (fields.label !== undefined) {
      const label = fields.label.trim();
      if (!label) throw new VehicleError('INVALID', 'A vehicle needs a label.');
      payload.label = label;
    }
    if (fields.vin !== undefined) {
      const vin = normalizeVin(fields.vin);
      const problem = vinProblem(vin);
      if (problem) throw new VehicleError('VIN_INVALID', problem);
      payload.vin = vin;
    }
    if (fields.customerId !== undefined) {
      const customerId = fields.customerId || null;
      if (customerId) await assertCustomerInTenant(customerId);
      payload.customer_id = customerId;
    }
    if (fields.trim !== undefined) payload.trim = fields.trim;
    if (fields.engine !== undefined) payload.engine = fields.engine;
    if (fields.transmission !== undefined) payload.transmission = fields.transmission;
    if (fields.mileage !== undefined) payload.mileage = fields.mileage;
    if (fields.plate !== undefined) payload.plate = fields.plate.trim();
    if (fields.status !== undefined) payload.status = fields.status;
    if (fields.recommendation !== undefined) payload.recommendation = fields.recommendation;
    if (fields.make !== undefined) payload.make = fields.make;
    if (fields.model !== undefined) payload.model = fields.model;
    if (fields.year !== undefined) payload.year = fields.year;
    if (fields.fuelType !== undefined) payload.fuel_type = fields.fuelType;

    if (Object.keys(payload).length === 0) return before;

    const { data, error } = await db
      .from('vehicles')
      .update(payload)
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .select()
      .single();
    if (error) throw error;

    const after = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.vehicleUpdated,
      entityType: 'vehicle',
      entityId: id,
      before: auditView(before),
      after: auditView(after),
    });
    return after;
  }

  return { list, get, create, patch };
}
