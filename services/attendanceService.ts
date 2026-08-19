/**
 * Compatibility wrapper for the attendance and leave domain.
 *
 * Same shape as the other wrappers: build a context from the browser's shop
 * store, delegate. Nothing here talks to Supabase directly, so the capability
 * checks and the audit rows cannot be skipped by calling the service instead
 * of the domain.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createAttendanceDomain, ATTENDANCE_STATUSES, PRESENT_STATUSES,
  AttendanceError, datesInRange, leaveDayCount,
  type AttendanceDay, type AttendanceInput, type AttendanceStatus,
  type LeaveRequest, type LeaveRequestInput, type LeaveStatus, type LeaveType,
} from '@/lib/domain/attendance';

export type { AttendanceDay, AttendanceInput, AttendanceStatus, LeaveRequest, LeaveRequestInput, LeaveStatus, LeaveType };
export { ATTENDANCE_STATUSES, PRESENT_STATUSES, AttendanceError, datesInRange, leaveDayCount };

async function domain() {
  return createAttendanceDomain(await browserDeps());
}

export async function fetchAttendance(from: string, to: string, employeeId?: string): Promise<AttendanceDay[]> {
  return (await domain()).listDays(from, to, employeeId);
}

export async function recordAttendance(input: AttendanceInput): Promise<AttendanceDay> {
  return (await domain()).recordDay(input);
}

export async function fetchLeaveTypes(): Promise<LeaveType[]> {
  return (await domain()).listLeaveTypes();
}

export async function fetchLeaveRequests(
  options: { status?: LeaveStatus; employeeId?: string } = {},
): Promise<LeaveRequest[]> {
  return (await domain()).listRequests(options);
}

export async function requestLeave(input: LeaveRequestInput): Promise<LeaveRequest> {
  return (await domain()).requestLeave(input);
}

/**
 * Approving also writes the attendance days, so the returned `dayError` is not
 * an afterthought: the leave IS granted when it is set, and the caller has to
 * say so rather than reporting a clean success.
 */
export async function decideLeave(
  id: string,
  decision: 'Approved' | 'Rejected',
  note = '',
): Promise<{ request: LeaveRequest; daysWritten: number; dayError: string | null }> {
  return (await domain()).decideLeave(id, decision, note);
}

export async function cancelLeave(id: string, note = ''): Promise<LeaveRequest> {
  return (await domain()).cancelLeave(id, note);
}
