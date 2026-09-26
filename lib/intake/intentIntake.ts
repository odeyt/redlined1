/**
 * Intent-based intake — the rules, with no I/O.
 *
 * After a customer or vehicle is saved, staff say what the customer needs and
 * the matching records are created (services/intakeService.ts). Everything
 * here is pure so it can be tested without a database: which choices exist,
 * what counts as a vehicle's active repair order, what each form requires,
 * and how a parts inquiry is written down.
 *
 * Two things this deliberately does NOT do. It never creates a repair order
 * from a customer record or a parts inquiry — only "Vehicle here for service"
 * does, and only when staff confirm. And it never touches historical
 * customers: nothing runs unless someone opens the panel.
 */

export type IntakeIntent = 'service_now' | 'service_later' | 'parts' | 'record_only';

export interface IntakeChoice {
  intent: IntakeIntent;
  label: string;
  hint: string;
}

export const INTAKE_CHOICES: readonly IntakeChoice[] = [
  { intent: 'service_now',   label: 'Vehicle here for service',   hint: 'Check the vehicle in and open a repair order now.' },
  { intent: 'service_later', label: 'Book service for later',     hint: 'Make an appointment. No repair order until the vehicle arrives.' },
  { intent: 'parts',         label: 'Parts inquiry or order',     hint: 'Quote or order a part. The vehicle does not need to be here.' },
  { intent: 'record_only',   label: 'Customer record only',       hint: 'Just save the customer. Start work from their record any time.' },
];

/**
 * Repair-order statuses that mean the job is still in the shop's hands.
 * Complete, Closed and Void are finished; everything else is active.
 */
export const INACTIVE_RO_STATUSES: readonly string[] = ['Complete', 'Closed', 'Void'];

export function isActiveRepairOrderStatus(status: string): boolean {
  return !INACTIVE_RO_STATUSES.includes((status || '').trim());
}

/** "2019  Ford F-150 " and "2019 ford f-150" are the same vehicle label. */
export function normalizeVehicleLabel(label: string): string {
  return (label || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * The given customer's active repair orders that are for this vehicle.
 *
 * repair_orders links a vehicle by its label, not an id, so the match is on
 * the normalised label. An empty label matches nothing: without knowing the
 * vehicle, no order can be said to be "for" it.
 */
export function activeOrdersForVehicle<T extends { vehicle: string; status: string }>(
  orders: readonly T[],
  vehicleLabel: string,
): T[] {
  const want = normalizeVehicleLabel(vehicleLabel);
  if (!want) return [];
  return orders.filter(o => isActiveRepairOrderStatus(o.status) && normalizeVehicleLabel(o.vehicle) === want);
}

export type FieldErrors = Partial<Record<string, string>>;

export interface ServiceIntakeFields {
  customerId: string;
  vehicleId: string;
  vehicleLabel: string;
  concern: string;
  location: string;
  /** Local date-time from an <input type="datetime-local">, or an ISO string. */
  arrivedAt: string;
  technician: string;
}

/** Arrival more than this far in the future is a typo, not a check-in. */
const ARRIVAL_FUTURE_TOLERANCE_MS = 15 * 60 * 1000;

export function validateServiceIntake(f: ServiceIntakeFields, now: Date = new Date()): FieldErrors {
  const errors: FieldErrors = {};
  if (!f.customerId) errors.customer = 'Choose the customer.';
  if (!f.vehicleId || !f.vehicleLabel.trim()) errors.vehicle = 'Choose the vehicle, or add one.';
  if (!f.concern.trim()) errors.concern = 'Describe the concern — why the vehicle is here.';
  if (f.concern.trim().length > 1000) errors.concern = 'Keep the concern under 1,000 characters.';
  if (!f.location.trim()) errors.location = 'Choose where the vehicle is.';
  const arrived = new Date(f.arrivedAt);
  if (!f.arrivedAt || Number.isNaN(arrived.getTime())) {
    errors.arrivedAt = 'Enter the arrival date and time.';
  } else if (arrived.getTime() - now.getTime() > ARRIVAL_FUTURE_TOLERANCE_MS) {
    errors.arrivedAt = 'Arrival cannot be in the future. For a later visit, book service instead.';
  }
  return errors;
}

export interface PartsInquiryFields {
  customerId: string;
  customerName: string;
  /** Optional: a parts inquiry never needs the vehicle to be at the shop. */
  vehicleLabel: string;
  partRequested: string;
  partNumber: string;
  quantity: string;
  fitment: string;
  contactPhone: string;
  contactEmail: string;
  referral: boolean;
  referredBy: string;
}

export function validatePartsInquiry(f: PartsInquiryFields): FieldErrors {
  const errors: FieldErrors = {};
  if (!f.customerId) errors.customer = 'Choose the customer.';
  if (!f.partRequested.trim()) errors.partRequested = 'Say which part is wanted.';
  if (!f.contactPhone.trim() && !f.contactEmail.trim()) {
    errors.contact = 'Add a phone number or email so the quote can reach them.';
  }
  if (f.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contactEmail.trim())) {
    errors.contact = 'That email address does not look right.';
  }
  const qty = Number(f.quantity || '1');
  if (!Number.isFinite(qty) || qty <= 0) errors.quantity = 'Quantity must be more than zero.';
  if (f.referral && !f.referredBy.trim()) errors.referredBy = 'Who referred them?';
  return errors;
}

/**
 * The quotation's notes for a parts inquiry.
 *
 * parts_estimates has no contact, fitment or referral columns, so they are
 * written into the notes in a fixed, readable shape — the same place staff
 * already read a quote's context. States plainly that no vehicle is at the
 * shop, so nobody mistakes the quote for a job.
 */
export function buildPartsInquiryNotes(f: PartsInquiryFields): string {
  const lines = [
    'Parts inquiry (intake)',
    `Part requested: ${f.partRequested.trim()}`,
    f.partNumber.trim() ? `Part number: ${f.partNumber.trim()}` : null,
    `Fitment: ${f.fitment.trim() || 'not given'}`,
    `Vehicle: ${f.vehicleLabel.trim() || 'not given'} — not at the shop`,
    `Contact: ${[f.contactPhone.trim(), f.contactEmail.trim()].filter(Boolean).join(' · ')}`,
    `Referral: ${f.referral ? `yes — ${f.referredBy.trim()}` : 'no'}`,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

/**
 * The customer an appointment is for, when that is unambiguous.
 *
 * Appointments store the customer by name only. Exactly one case-insensitive
 * match resolves it; none or several returns null and staff choose — the
 * intake never guesses which of two "John Smith"s a car belongs to.
 */
export function matchCustomerByName<T extends { id: string; name: string }>(
  customers: readonly T[],
  name: string,
): T | null {
  const want = (name || '').trim().toLowerCase();
  if (!want) return null;
  const hits = customers.filter(c => (c.name || '').trim().toLowerCase() === want);
  return hits.length === 1 ? hits[0] : null;
}

/** A datetime-local value ("2026-09-26T09:15") for the given instant, in local time. */
export function toDateTimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
