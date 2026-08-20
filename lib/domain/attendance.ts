/**
 * Was this person at work, and who is off next week.
 *
 * ## Not time_entries
 *
 * `time_entries` records how long a job took: it is labour costing, it hangs
 * off a job card, and it is what a customer is eventually charged from.
 * Attendance answers a different question — whether someone came in at all —
 * and it has to hold days with no job on them: a technician who spent Tuesday
 * cleaning the workshop was at work, and a day of leave has no clock times.
 *
 * Merging the two would mean an attendance correction silently rewrites what a
 * customer was billed. They stay separate, and time_entries is untouched.
 *
 * ## One day per person
 *
 * Attendance rows are unique on (employee_id, work_date), not per shop. Someone
 * who helped at both branches on a Tuesday still worked one Tuesday, and two
 * rows would double-count them the moment payroll reads this. Which shop they
 * were at is recorded on the row; it is not part of identity.
 *
 * ## Leave writes attendance
 *
 * Approving leave marks those days as Leave. Two sources of truth that can
 * disagree about whether someone was at work is the bug this design exists to
 * avoid — payroll must not have to reconcile a rota against a calendar.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';
import { emitDomainEvent, DOMAIN_EVENTS } from './events';

export type AttendanceStatus =
  | 'Present' | 'Late' | 'Half day' | 'Absent' | 'Leave' | 'Holiday' | 'Rest day';

export const ATTENDANCE_STATUSES: readonly AttendanceStatus[] =
  ['Present', 'Late', 'Half day', 'Absent', 'Leave', 'Holiday', 'Rest day'];

/** Statuses that mean the person was actually at work. */
export const PRESENT_STATUSES: readonly AttendanceStatus[] = ['Present', 'Late', 'Half day'];

export type LeaveStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface AttendanceDay {
  id: string;
  organizationId: string;
  shopId: string;
  employeeId: string;
  workDate: string;
  status: AttendanceStatus;
  firstIn: string | null;
  lastOut: string | null;
  minutesWorked: number | null;
  notes: string;
  recordedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveType {
  id: string;
  organizationId: string;
  name: string;
  isPaid: boolean;
  annualDays: number | null;
  isActive: boolean;
}

export interface LeaveRequest {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  reason: string;
  status: LeaveStatus;
  requestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
}

export interface AttendanceInput {
  employeeId: string;
  workDate: string;
  status: AttendanceStatus;
  firstIn?: string | null;
  lastOut?: string | null;
  minutesWorked?: number | null;
  notes?: string;
}

export interface LeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDay?: boolean;
  reason?: string;
}

/** The message out of whatever was thrown — Error, PostgrestError, or neither. */
function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return 'unknown error';
}

export class AttendanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttendanceError';
  }
}

function mapDay(row: Record<string, unknown>): AttendanceDay {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    shopId: row.shop_id as string,
    employeeId: row.employee_id as string,
    workDate: row.work_date as string,
    status: (row.status as AttendanceStatus) ?? 'Present',
    firstIn: (row.first_in as string) ?? null,
    lastOut: (row.last_out as string) ?? null,
    minutesWorked: row.minutes_worked === null || row.minutes_worked === undefined
      ? null : Number(row.minutes_worked),
    notes: (row.notes as string) ?? '',
    recordedBy: (row.recorded_by as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
    updatedAt: (row.updated_at as string) ?? '',
  };
}

function mapLeaveType(row: Record<string, unknown>): LeaveType {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: (row.name as string) ?? '',
    isPaid: row.is_paid !== false,
    annualDays: row.annual_days === null || row.annual_days === undefined
      ? null : Number(row.annual_days),
    isActive: row.is_active !== false,
  };
}

function mapRequest(row: Record<string, unknown>): LeaveRequest {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    employeeId: row.employee_id as string,
    leaveTypeId: row.leave_type_id as string,
    startDate: row.start_date as string,
    endDate: row.end_date as string,
    halfDay: row.half_day === true,
    reason: (row.reason as string) ?? '',
    status: (row.status as LeaveStatus) ?? 'Pending',
    requestedBy: (row.requested_by as string) ?? null,
    decidedBy: (row.decided_by as string) ?? null,
    decidedAt: (row.decided_at as string) ?? null,
    decisionNote: (row.decision_note as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
  };
}

/**
 * Every date from start to end inclusive, as YYYY-MM-DD.
 *
 * Built in UTC deliberately. Local-time arithmetic across a DST boundary drops
 * or repeats a day, and a leave range that quietly loses its last day is the
 * kind of error nobody notices until someone is marked absent for it.
 */
export function datesInRange(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new AttendanceError('Those dates could not be read.');
  }
  if (end < start) throw new AttendanceError('The end date is before the start date.');
  for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Whole days a request covers. A half day counts as 0.5. */
export function leaveDayCount(request: Pick<LeaveRequest, 'startDate' | 'endDate' | 'halfDay'>): number {
  if (request.halfDay) return 0.5;
  return datesInRange(request.startDate, request.endDate).length;
}

export function createAttendanceDomain({ db, context }: DomainDeps) {
  function organizationId(): string {
    if (!context.organizationId) {
      throw new AttendanceError(
        'This shop is not linked to a business yet, so attendance cannot be recorded.',
      );
    }
    return context.organizationId;
  }

  function shopId(): string {
    if (!context.shopId) {
      throw new AttendanceError('No shop is selected, so there is nowhere to record this against.');
    }
    return context.shopId;
  }

  // ── Attendance ────────────────────────────────────────────────────────────

  async function listDays(from: string, to: string, employeeId?: string): Promise<AttendanceDay[]> {
    requireCapability(context, 'attendance.read', 'see attendance');
    let query = db
      .from('attendance_days')
      .select('*')
      .eq('organization_id', organizationId())
      .gte('work_date', from)
      .lte('work_date', to);
    if (employeeId) query = query.eq('employee_id', employeeId);
    const { data, error } = await query.order('work_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapDay);
  }

  /**
   * Record or correct one person's day.
   *
   * Upsert rather than insert: the natural key is the person and the date, and
   * an operator marking the same day twice means "I got it wrong the first
   * time", not "they worked two Tuesdays".
   *
   * A first record and a correction are audited as DIFFERENT actions. The
   * question anyone ever asks of this table is who changed a day after the
   * fact — filing both as "recorded" would bury it.
   */
  async function recordDay(input: AttendanceInput): Promise<AttendanceDay> {
    requireCapability(context, 'attendance.manage', 'record attendance');

    if (!ATTENDANCE_STATUSES.includes(input.status)) {
      throw new AttendanceError(input.status + ' is not a status this system knows.');
    }

    const { data: existing, error: readError } = await db
      .from('attendance_days')
      .select('*')
      .eq('employee_id', input.employeeId)
      .eq('work_date', input.workDate)
      .maybeSingle();
    if (readError) throw readError;

    const before = existing ? mapDay(existing) : null;

    // Clock times are cleared when the day is not a working one. Leaving
    // yesterday's times on a day since corrected to Absent is how a person
    // reads as both away and on the clock.
    const worked = PRESENT_STATUSES.includes(input.status);
    const payload = {
      organization_id: organizationId(),
      shop_id: shopId(),
      employee_id: input.employeeId,
      work_date: input.workDate,
      status: input.status,
      first_in: worked ? (input.firstIn ?? null) : null,
      last_out: worked ? (input.lastOut ?? null) : null,
      minutes_worked: worked ? (input.minutesWorked ?? null) : null,
      notes: input.notes ?? '',
      recorded_by: context.actor.userId ?? null,
    };

    const { data, error } = await db
      .from('attendance_days')
      .upsert(payload, { onConflict: 'employee_id,work_date' })
      .select()
      .single();
    if (error) throw error;

    const day = mapDay(data);
    await writeAuditEvent(db, context, {
      action: before ? AUDIT.attendanceCorrected : AUDIT.attendanceRecorded,
      entityType: 'attendance_day',
      entityId: day.id,
      before: before
        ? { workDate: before.workDate, status: before.status, minutesWorked: before.minutesWorked }
        : null,
      after: { workDate: day.workDate, status: day.status, minutesWorked: day.minutesWorked, employeeId: day.employeeId },
    });
    return day;
  }

  // ── Leave ─────────────────────────────────────────────────────────────────

  async function listLeaveTypes(): Promise<LeaveType[]> {
    const { data, error } = await db
      .from('leave_types')
      .select('*')
      .eq('organization_id', organizationId())
      .order('name');
    if (error) throw error;
    return (data ?? []).map(mapLeaveType);
  }

  async function listRequests(options: { status?: LeaveStatus; employeeId?: string } = {}): Promise<LeaveRequest[]> {
    requireCapability(context, 'leave.read', 'see leave requests');
    let query = db
      .from('leave_requests')
      .select('*')
      .eq('organization_id', organizationId());
    if (options.status) query = query.eq('status', options.status);
    if (options.employeeId) query = query.eq('employee_id', options.employeeId);
    const { data, error } = await query.order('start_date', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapRequest);
  }

  /**
   * Raise a request. Always Pending — there is no path here that creates an
   * already-approved one, so approval always leaves a decision record naming
   * who made it.
   */
  async function requestLeave(input: LeaveRequestInput): Promise<LeaveRequest> {
    requireCapability(context, 'leave.request', 'request leave');

    // Checked here as well as in the CHECK constraint, so the person gets a
    // sentence rather than a Postgres error code.
    if (input.endDate < input.startDate) {
      throw new AttendanceError('The last day of leave is before the first.');
    }
    if (input.halfDay && input.startDate !== input.endDate) {
      throw new AttendanceError('A half day has to start and end on the same day.');
    }

    const { data, error } = await db
      .from('leave_requests')
      .insert({
        organization_id: organizationId(),
        employee_id: input.employeeId,
        leave_type_id: input.leaveTypeId,
        start_date: input.startDate,
        end_date: input.endDate,
        half_day: input.halfDay ?? false,
        reason: input.reason ?? '',
        status: 'Pending',
        requested_by: context.actor.userId ?? null,
      })
      .select()
      .single();

    if (error) {
      // 23P01 is the exclusion constraint: this person already has a live
      // request covering some of these dates.
      if ((error as { code?: string }).code === '23P01') {
        throw new AttendanceError(
          'This person already has leave booked or requested over some of those dates.',
        );
      }
      throw error;
    }

    const request = mapRequest(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.leaveRequested,
      entityType: 'leave_request',
      entityId: request.id,
      after: {
        employeeId: request.employeeId, startDate: request.startDate,
        endDate: request.endDate, days: leaveDayCount(request),
      },
    });
    return request;
  }

  /**
   * Approve or reject.
   *
   * Approving also writes the attendance days, so the rota and the calendar
   * cannot disagree about whether someone was at work. The order matters: the
   * decision is recorded first, and the days follow. If the days fail, the
   * request is still approved and the failure is reported — a person whose
   * leave was granted but whose calendar is incomplete is recoverable, whereas
   * days marked Leave with no approval behind them are a hole in the record.
   */
  async function decideLeave(
    id: string,
    decision: 'Approved' | 'Rejected',
    note = '',
  ): Promise<{ request: LeaveRequest; daysWritten: number; dayError: string | null }> {
    requireCapability(context, 'leave.approve', 'approve or reject leave');

    const { data: current, error: readError } = await db
      .from('leave_requests')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId())
      .maybeSingle();
    if (readError) throw readError;
    if (!current) throw new AttendanceError('That leave request no longer exists.');

    const existing = mapRequest(current);
    if (existing.status !== 'Pending') {
      throw new AttendanceError(
        'That request was already ' + existing.status.toLowerCase() + '.',
      );
    }

    const { data, error } = await db
      .from('leave_requests')
      .update({
        status: decision,
        decided_by: context.actor.userId ?? null,
        decided_at: new Date().toISOString(),
        decision_note: note,
      })
      .eq('id', id)
      .eq('organization_id', organizationId())
      .eq('status', 'Pending')   // nobody else decided it while this was in flight
      .select()
      .single();
    if (error) throw error;

    const request = mapRequest(data);

    // Only approval is an event. A rejection changes nothing outside this
    // system — nobody is absent, no payroll line moves — whereas an approval
    // is what a scheduling or payroll consumer has to react to.
    if (decision === 'Approved') {
      await emitDomainEvent(db, context, {
        eventType: DOMAIN_EVENTS.leaveApproved,
        aggregateType: 'leave_request',
        aggregateId: request.id,
        payload: {
          employeeId: request.employeeId,
          leaveTypeId: request.leaveTypeId,
          startDate: request.startDate,
          endDate: request.endDate,
          days: leaveDayCount(request),
        },
        idempotencyKey: 'leave.approved:' + request.id,
      });
    }

    await writeAuditEvent(db, context, {
      action: decision === 'Approved' ? AUDIT.leaveApproved : AUDIT.leaveRejected,
      entityType: 'leave_request',
      entityId: request.id,
      before: { status: 'Pending' },
      after: {
        status: request.status, employeeId: request.employeeId,
        startDate: request.startDate, endDate: request.endDate,
        days: leaveDayCount(request),
      },
    });

    let daysWritten = 0;
    let dayError: string | null = null;

    if (decision === 'Approved') {
      try {
        const rows = datesInRange(request.startDate, request.endDate).map(workDate => ({
          organization_id: organizationId(),
          shop_id: shopId(),
          employee_id: request.employeeId,
          work_date: workDate,
          status: request.halfDay ? 'Half day' : 'Leave',
          first_in: null,
          last_out: null,
          minutes_worked: null,
          notes: 'Approved leave',
          recorded_by: context.actor.userId ?? null,
        }));
        const { data: written, error: dayWriteError } = await db
          .from('attendance_days')
          .upsert(rows, { onConflict: 'employee_id,work_date' })
          .select('id');
        if (dayWriteError) throw dayWriteError;
        daysWritten = (written ?? []).length;
      } catch (error) {
        // A Supabase error is a plain object, not an Error. Testing for one
        // discarded the message and reported 'unknown error' for every
        // failure — which is the least useful thing to tell someone whose
        // approved leave did not reach the calendar.
        dayError = messageOf(error);
      }
    }

    return { request, daysWritten, dayError };
  }

  /**
   * Withdraw a request.
   *
   * Allowed while Pending, and after approval too — plans change, and a person
   * who comes back early should not leave the calendar claiming they were off.
   * The attendance days an approval wrote are NOT rolled back here: whether
   * they actually worked those days is a separate fact from whether the leave
   * was cancelled, and guessing would overwrite a real record.
   */
  async function cancelLeave(id: string, note = ''): Promise<LeaveRequest> {
    requireCapability(context, 'leave.approve', 'cancel leave');

    const { data, error } = await db
      .from('leave_requests')
      .update({
        status: 'Cancelled',
        decided_by: context.actor.userId ?? null,
        decided_at: new Date().toISOString(),
        decision_note: note,
      })
      .eq('id', id)
      .eq('organization_id', organizationId())
      .in('status', ['Pending', 'Approved'])
      .select()
      .single();
    if (error) throw error;

    const request = mapRequest(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.leaveCancelled,
      entityType: 'leave_request',
      entityId: request.id,
      after: {
        employeeId: request.employeeId,
        startDate: request.startDate, endDate: request.endDate,
      },
    });
    return request;
  }

  return {
    listDays, recordDay,
    listLeaveTypes, listRequests, requestLeave, decideLeave, cancelLeave,
  };
}
