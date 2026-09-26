import { createJobCard, fetchJobCardById } from './jobCardService';
import { createJobCardFollowOns } from './jobCardFollowOnService';
import { fetchActiveRepairOrdersForCustomer, type RepairOrder } from './repairOrderService';
import { createPartsEstimate, fetchPartsEstimateById, type PartsEstimate } from './partsEstimateService';
import { setVehicleStatus } from './vehicleService';
import { updateAppointment, type AppointmentRecord } from './appointmentService';
import {
  activeOrdersForVehicle, buildPartsInquiryNotes, type PartsInquiryFields,
} from '@/lib/intake/intentIntake';

/**
 * Intent-based intake — the writes.
 *
 * "Vehicle here for service" goes through the same chain Vehicle Intake and
 * inspection completion already use: a job card, then
 * createJobCardFollowOns, which raises the repair order and the draft parts
 * quotation keyed by the job card id. Nothing here inserts a repair order
 * directly, so numbering, pricing defaults, shop scoping and audit are the
 * existing ones, and the Job Card ↔ Repair Order link is the existing one.
 *
 * Duplicate protection, in three layers:
 *   1. The caller settles `requestId` once per form (a job card id for a
 *      visit, a uuid for a parts inquiry). A retry of the same submission
 *      collides on that primary key instead of creating a second record,
 *      and the follow-ons are already keyed by the job card id.
 *   2. Within one tab, a second press while the first is in flight shares
 *      the first promise.
 *   3. Before a NEW visit, the vehicle's active repair orders are checked and
 *      staff must choose to open one or deliberately start a separate visit.
 *
 * Partial failure never loses what was saved. Once the job card exists the
 * visit is real; anything after it (repair order, quotation, vehicle status,
 * appointment link) that fails is reported as a warning with the record ids,
 * so staff can carry on from the job card.
 */

const PG_UNIQUE_VIOLATION = '23505';

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === PG_UNIQUE_VIOLATION;
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : (e as { message?: string })?.message ?? 'unknown error';
}

export interface ServiceVisitInput {
  /** Settled once per form: the job card id this visit will have. */
  requestId: string;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehicleLabel: string;
  concern: string;
  location: string;
  /** ISO instant the vehicle arrived. */
  arrivedAt: string;
  /** Optional; empty leaves the repair order unassigned. */
  technician: string;
  /** Set when the visit comes from an appointment being checked in. */
  appointment?: AppointmentRecord | null;
  /**
   * Staff saw the vehicle's active repair order(s) and chose a separate
   * visit anyway. Without it, an active order stops the intake.
   */
  allowSeparateVisit?: boolean;
}

export type ServiceVisitResult =
  | { kind: 'active_order_exists'; orders: RepairOrder[] }
  | {
      kind: 'created';
      jobCardId: string;
      /** Null when the job card saved but the repair order did not. */
      roNumber: string | null;
      /** True when this call found the visit already created (a retry). */
      reused: boolean;
      needsTechnician: boolean;
      /** One line per follow-on step that failed; empty when all succeeded. */
      warnings: string[];
    };

const visitsInFlight = new Map<string, Promise<ServiceVisitResult>>();

export function startServiceVisit(input: ServiceVisitInput): Promise<ServiceVisitResult> {
  const running = visitsInFlight.get(input.requestId);
  if (running) return running;
  const run = runServiceVisit(input).finally(() => visitsInFlight.delete(input.requestId));
  visitsInFlight.set(input.requestId, run);
  return run;
}

async function runServiceVisit(input: ServiceVisitInput): Promise<ServiceVisitResult> {
  const warnings: string[] = [];

  // A retry of this same submission: the job card is already there, so skip
  // the active-order check (it would find the order this intake made) and
  // just make sure the follow-ons exist.
  let job = await fetchJobCardById(input.requestId);
  const reused = job !== null;

  if (!job && !input.allowSeparateVisit) {
    const active = activeOrdersForVehicle(
      await fetchActiveRepairOrdersForCustomer(input.customerId),
      input.vehicleLabel,
    );
    if (active.length > 0) return { kind: 'active_order_exists', orders: active };
  }

  const technicians = input.technician.trim() ? [input.technician.trim()] : [];

  if (!job) {
    try {
      job = await createJobCard({
        id:           input.requestId,
        customer:     input.customerName,
        vehicle:      input.vehicleLabel,
        serviceType:  input.concern.trim(),
        channel:      'Shop bay',
        location:     input.location.trim(),
        technicians,
        priority:     'Normal',
        approvalCode: '',
        notes:        input.concern.trim(),
        checkInDate:  input.arrivedAt,
      });
    } catch (e) {
      // Another tab or a retried request won the race for this id. The job
      // card exists — use it rather than fail an intake that succeeded.
      if (!isUniqueViolation(e)) throw e;
      job = await fetchJobCardById(input.requestId);
      if (!job) throw e;
    }
  }

  const followOn = await createJobCardFollowOns({
    jobCardId:    job.id,
    customerName: input.customerName,
    customerId:   input.customerId,
    vehicle:      input.vehicleLabel,
    serviceType:  input.concern.trim(),
    notes:        input.concern.trim(),
    technician:   input.technician,
  });
  warnings.push(...followOn.errors);

  // The vehicle is at the shop now — the one intake choice that says so.
  try {
    await setVehicleStatus(input.vehicleId, 'In Progress');
  } catch (e) {
    warnings.push(`Vehicle status: ${message(e)} — move it to Work In Progress on the board.`);
  }

  if (input.appointment) {
    const appt = input.appointment;
    try {
      const data = [...appt.data] as typeof appt.data;
      data[4] = job.id;          // job_card: the appointment now points at its visit
      data[6] = 'Checked in';
      await updateAppointment(appt.id, appt.date, data);
    } catch (e) {
      warnings.push(`Appointment link: ${message(e)}`);
    }
  }

  return {
    kind: 'created',
    jobCardId: job.id,
    roNumber: followOn.roNumber,
    reused,
    needsTechnician: technicians.length === 0,
    warnings,
  };
}

export interface PartsInquiryInput extends PartsInquiryFields {
  /** Settled once per form: the quotation's id. */
  requestId: string;
  currency: string;
}

export interface PartsInquiryResult {
  estimate: PartsEstimate;
  /** True when this call found the inquiry already filed (a retry). */
  reused: boolean;
}

const partsInFlight = new Map<string, Promise<PartsInquiryResult>>();

/**
 * A parts inquiry becomes a Draft parts quotation, and nothing else.
 *
 * No job card, no repair order, and the vehicle's status is not touched: a
 * customer asking about a part is not a car in a bay. The quotation carries
 * no job card or repair-order number, and the existing Parts Quotations
 * screen converts it to a Parts Order when the customer goes ahead.
 */
export function createPartsInquiry(input: PartsInquiryInput): Promise<PartsInquiryResult> {
  const running = partsInFlight.get(input.requestId);
  if (running) return running;
  const run = runPartsInquiry(input).finally(() => partsInFlight.delete(input.requestId));
  partsInFlight.set(input.requestId, run);
  return run;
}

async function runPartsInquiry(input: PartsInquiryInput): Promise<PartsInquiryResult> {
  const existing = await fetchPartsEstimateById(input.requestId);
  if (existing) return { estimate: existing, reused: true };

  const quantity = Number(input.quantity || '1') || 1;
  try {
    const estimate = await createPartsEstimate({
      lineItems: [{
        partName: input.partRequested.trim(),
        partNumber: input.partNumber.trim(),
        condition: 'New',
        quantity,
        unitCost: 0,
      }],
      partName:   input.partRequested.trim(),
      partNumber: input.partNumber.trim(),
      condition:  'New',
      quantity,
      // Nobody has priced it yet; a zero is "not quoted", not a price.
      unitCost:   0,
      vendorName: '', vendorPhone: '', vendorEmail: '',
      coreCharge: 0,
      totalCost:  0,
      deposit:    0,
      depositCurrency: input.currency,
      status:     'Draft',
      quoteDate:  new Date().toISOString().slice(0, 10),
      validUntil: '',
      jobCardNumber: '',
      repairOrderNumber: '',
      vehicle:      input.vehicleLabel.trim(),
      customerName: input.customerName,
      notes:        buildPartsInquiryNotes(input),
      currency:     input.currency,
    }, { id: input.requestId });
    return { estimate, reused: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const again = await fetchPartsEstimateById(input.requestId);
    if (!again) throw e;
    return { estimate: again, reused: true };
  }
}
