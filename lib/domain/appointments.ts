/**
 * Appointments, callable from anywhere.
 *
 * Ported from services/appointmentService.ts. Read the schema and the nine
 * production rows before writing this, because the model is not what an
 * appointments API usually assumes.
 *
 * ## Three things that shape everything below
 *
 * **1. There is no timestamp.** `date` is a `YYYY-MM-DD` string and `time` is
 * an `HH:MM` string, in two separate text columns. There is no `timestamptz`,
 * no end time, and no duration. `shops` has no timezone column either — the
 * table is `id, name, slug, created_at, organization_id` — so nothing in the
 * system records what zone "10:10" is in. It is the shop's wall clock, and
 * that is all it has ever been.
 *
 * This module keeps that. Presenting a wall-clock string as an ISO-8601
 * instant would invent a precision the data does not have, and every
 * conversion after that would be built on a guess about the shop's zone.
 *
 * **2. Customer, vehicle and technician are free text, not references.** The
 * production rows hold "SAISAVANH MOTOR", "Audi R8 2008 #6666", "Beck" — and
 * one row has a vehicle description sitting in the customer field. They are
 * display strings a service advisor typed, not foreign keys.
 *
 * So there is no related record to tenant-verify, and equally no id through
 * which another tenant's data could leak. The tenant boundary here is
 * `shop_id` alone.
 *
 * **3. There is no status machine.** `reminder` holds "Checked in" or "None"
 * in the data and defaults to "Confirmed" in the old service — three values
 * from two sources, with no transitions defined anywhere. It is a marker a
 * human sets, not a lifecycle. This module does not invent one.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';

export interface DomainAppointment {
  id: string;
  /** Shop-local wall clock, YYYY-MM-DD. Not an instant. */
  date: string;
  /** Shop-local wall clock, HH:MM. Not an instant. */
  time: string;
  customer: string;
  vehicle: string;
  service: string;
  jobCard: string;
  bay: string;
  /** A marker a human sets. NOT a lifecycle status; there are no transitions. */
  reminder: string;
  technician: string;
  shopId: string;
}

export interface AppointmentInput {
  date: string;
  time: string;
  customer?: string;
  vehicle?: string;
  service?: string;
  jobCard?: string;
  bay?: string;
  reminder?: string;
  technician?: string;
}

export class AppointmentError extends Error {
  readonly reason: 'INVALID_DATE' | 'INVALID_TIME' | 'INVALID';
  constructor(reason: 'INVALID_DATE' | 'INVALID_TIME' | 'INVALID', message: string) {
    super(message);
    this.name = 'AppointmentError';
    this.reason = reason;
  }
}

/** What the old service wrote when nothing was supplied. */
export const DEFAULT_REMINDER = 'Confirmed';

/**
 * A calendar date, as the column stores it.
 *
 * Checked against the calendar, not just the shape: "2026-02-30" matches the
 * pattern and is not a day. A rejected impossible date is a typo caught at the
 * edge; an accepted one is an appointment nobody can ever attend.
 */
export function dateProblem(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'A date must look like YYYY-MM-DD.';
  const [y, m, d] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  if (parsed.getUTCFullYear() !== y || parsed.getUTCMonth() !== m - 1 || parsed.getUTCDate() !== d) {
    return 'That date does not exist.';
  }
  return null;
}

/**
 * A wall-clock time of day.
 *
 * 24-hour only. The stored values are "09:00", "10:10", "01:20" — no meridiem,
 * no seconds — and accepting "9am" here would put a format in the column that
 * every existing reader would sort wrongly, because the column is TEXT and
 * ordering is lexicographic.
 */
export function timeProblem(time: string): string | null {
  if (!/^\d{2}:\d{2}$/.test(time)) return 'A time must look like HH:MM, 24-hour.';
  const [h, min] = time.split(':').map(Number);
  if (h > 23 || min > 59) return 'That time does not exist.';
  return null;
}

function mapRow(row: Record<string, unknown>): DomainAppointment {
  const s = (v: unknown) => (v == null ? '' : String(v));
  return {
    id: s(row.id),
    date: s(row.date),
    time: s(row.time),
    customer: s(row.customer),
    vehicle: s(row.vehicle),
    service: s(row.service),
    jobCard: s(row.job_card),
    bay: s(row.bay),
    reminder: s(row.reminder),
    technician: s(row.technician),
    shopId: s(row.shop_id),
  };
}

function auditView(a: DomainAppointment): Record<string, unknown> {
  return {
    date: a.date, time: a.time, customer: a.customer, vehicle: a.vehicle,
    service: a.service, technician: a.technician, bay: a.bay, reminder: a.reminder,
  };
}

export function createAppointmentDomain({ db, context }: DomainDeps) {
  async function list(options: { from?: string; to?: string } = {}): Promise<DomainAppointment[]> {
    let query = db.from('appointments').select('*').in('shop_id', context.shopIds);

    // Lexicographic comparison is correct for YYYY-MM-DD, which is why the
    // format is enforced on the way in rather than tidied on the way out.
    if (options.from) query = query.gte('date', options.from);
    if (options.to) query = query.lte('date', options.to);

    const { data, error } = await query.order('date').order('time');
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async function get(id: string): Promise<DomainAppointment | null> {
    const { data, error } = await db
      .from('appointments')
      .select('*')
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  async function create(input: AppointmentInput): Promise<DomainAppointment> {
    requireCapability(context, 'appointments.manage', 'book appointments');

    const date = (input.date ?? '').trim();
    const time = (input.time ?? '').trim();

    const dateIssue = dateProblem(date);
    if (dateIssue) throw new AppointmentError('INVALID_DATE', dateIssue);
    const timeIssue = timeProblem(time);
    if (timeIssue) throw new AppointmentError('INVALID_TIME', timeIssue);

    const { data, error } = await db
      .from('appointments')
      .insert({
        shop_id: context.shopId,
        date,
        time,
        customer: input.customer ?? '',
        vehicle: input.vehicle ?? '',
        service: input.service ?? '',
        job_card: input.jobCard ?? '',
        bay: input.bay ?? '',
        reminder: input.reminder || DEFAULT_REMINDER,
        technician: input.technician ?? '',
      })
      .select()
      .single();
    if (error) throw error;

    const appointment = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.appointmentCreated,
      entityType: 'appointment',
      entityId: appointment.id,
      after: auditView(appointment),
    });
    return appointment;
  }

  /**
   * Change the fields a caller may change.
   *
   * shop_id is absent deliberately, as it is for vehicles: a routine edit must
   * not be able to move an appointment to another branch.
   *
   * No transition rules, because there are none to enforce. `reminder` is
   * validated for length and nothing else — pretending otherwise would mean
   * inventing a state machine and then calling it "the existing one".
   */
  async function patch(id: string, fields: Partial<AppointmentInput>): Promise<DomainAppointment> {
    requireCapability(context, 'appointments.manage', 'change appointments');

    const before = await get(id);
    if (!before) throw new AppointmentError('INVALID', 'No such appointment.');

    const payload: Record<string, unknown> = {};

    if (fields.date !== undefined) {
      const date = fields.date.trim();
      const issue = dateProblem(date);
      if (issue) throw new AppointmentError('INVALID_DATE', issue);
      payload.date = date;
    }
    if (fields.time !== undefined) {
      const time = fields.time.trim();
      const issue = timeProblem(time);
      if (issue) throw new AppointmentError('INVALID_TIME', issue);
      payload.time = time;
    }
    if (fields.customer !== undefined) payload.customer = fields.customer;
    if (fields.vehicle !== undefined) payload.vehicle = fields.vehicle;
    if (fields.service !== undefined) payload.service = fields.service;
    if (fields.jobCard !== undefined) payload.job_card = fields.jobCard;
    if (fields.bay !== undefined) payload.bay = fields.bay;
    if (fields.reminder !== undefined) payload.reminder = fields.reminder;
    if (fields.technician !== undefined) payload.technician = fields.technician;

    if (Object.keys(payload).length === 0) return before;

    const { data, error } = await db
      .from('appointments')
      .update(payload)
      .eq('id', id)
      .in('shop_id', context.shopIds)
      .select()
      .single();
    if (error) throw error;

    const after = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.appointmentUpdated,
      entityType: 'appointment',
      entityId: id,
      before: auditView(before),
      after: auditView(after),
    });
    return after;
  }

  return { list, get, create, patch };
}
