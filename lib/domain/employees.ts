/**
 * One record per person, per business.
 *
 * `technicians` is a per-SHOP directory: D1 has 25 rows for 13 people, because
 * twelve of them appear once in each location. That is right for a shop-floor
 * roster and wrong for anything about the person — pay them twice, count their
 * attendance twice, give them two employment histories.
 *
 * So employees are scoped to the ORGANIZATION, and `technicians.employee_id`
 * points at the person a directory row describes. The directory is unchanged:
 * job cards store technician names and match them per shop, and rewriting that
 * is a separate, riskier change with nothing to gain here.
 *
 * ## Not here
 *
 * Pay, attendance and leave. `technicians.pay_type` and `pay_rate` stay where
 * they are until salary can be VERSIONED — "what were they paid in March" is a
 * question one column cannot answer — and until the capability checks that
 * protect it are in place. An unversioned salary column readable by anyone who
 * can read an employee would be worse than the duplication this fixes.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';

export type EmploymentStatus = 'Active' | 'On leave' | 'Suspended' | 'Left';

export const EMPLOYMENT_STATUSES: readonly EmploymentStatus[] =
  ['Active', 'On leave', 'Suspended', 'Left'];

export interface DomainEmployee {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
  phone: string;
  /** The login, where they have one. Most staff do not. */
  userId: string | null;
  employmentStatus: EmploymentStatus;
  hireDate: string | null;
  endDate: string | null;
  notes: string;
  archivedAt: string | null;
  createdAt: string;
}

export type EmployeeInput = Omit<
  DomainEmployee, 'id' | 'organizationId' | 'archivedAt' | 'createdAt'
>;

function mapRow(row: Record<string, unknown>): DomainEmployee {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    fullName: (row.full_name as string) ?? '',
    email: (row.email as string) ?? '',
    phone: (row.phone as string) ?? '',
    userId: (row.user_id as string) ?? null,
    employmentStatus: ((row.employment_status as EmploymentStatus) ?? 'Active'),
    hireDate: (row.hire_date as string) ?? null,
    endDate: (row.end_date as string) ?? null,
    notes: (row.notes as string) ?? '',
    archivedAt: (row.archived_at as string) ?? null,
    createdAt: (row.created_at as string) ?? '',
  };
}

/**
 * What an audit row keeps.
 *
 * Employment status and dates are the point — those are what somebody will
 * later need to explain. Notes are excluded: they are free text about a person,
 * and an audit table is read by more people and kept longer than the record.
 */
function auditView(e: DomainEmployee): Record<string, unknown> {
  return {
    id: e.id,
    fullName: e.fullName,
    employmentStatus: e.employmentStatus,
    hireDate: e.hireDate,
    endDate: e.endDate,
    hasLogin: e.userId !== null,
    archivedAt: e.archivedAt,
  };
}

export class EmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmployeeError';
  }
}

export function createEmployeeDomain({ db, context }: DomainDeps) {
  /**
   * Employees belong to the organization, not the shop — that IS the fix.
   * A context without one cannot answer "which people work for this business",
   * and guessing from the shop would silently give a two-location owner half
   * their staff.
   */
  function organizationId(): string {
    if (!context.organizationId) {
      throw new EmployeeError('This shop is not linked to a business yet, so its people cannot be listed.');
    }
    return context.organizationId;
  }

  async function list(options: { includeArchived?: boolean } = {}): Promise<DomainEmployee[]> {
    requireCapability(context, 'employees.read', 'see employee records');
    let query = db
      .from('employees')
      .select('*')
      .eq('organization_id', organizationId());
    if (!options.includeArchived) query = query.is('archived_at', null);
    const { data, error } = await query.order('full_name');
    if (error) throw error;
    return (data ?? []).map(mapRow);
  }

  async function get(id: string): Promise<DomainEmployee | null> {
    requireCapability(context, 'employees.read', 'see employee records');
    const { data, error } = await db
      .from('employees')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId())
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data) : null;
  }

  /** The shops a person actually works at, via the directory rows. */
  async function shopsFor(employeeId: string): Promise<string[]> {
    requireCapability(context, 'employees.read', 'see employee records');
    const { data, error } = await db
      .from('technicians')
      .select('shop_id')
      .eq('employee_id', employeeId);
    if (error) throw error;
    return [...new Set((data ?? []).map(r => r.shop_id as string))];
  }

  async function create(input: EmployeeInput): Promise<DomainEmployee> {
    requireCapability(context, 'employees.manage', 'add employees');
    const name = input.fullName.trim();
    if (!name) throw new EmployeeError('An employee needs a name.');

    const { data, error } = await db
      .from('employees')
      .insert({
        organization_id: organizationId(),
        full_name: name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        user_id: input.userId || null,
        employment_status: input.employmentStatus || 'Active',
        hire_date: input.hireDate || null,
        end_date: input.endDate || null,
        notes: input.notes || null,
      })
      .select()
      .single();
    if (error) throw translate(error);

    const employee = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.employeeCreated,
      entityType: 'employee',
      entityId: employee.id,
      after: auditView(employee),
    });
    return employee;
  }

  async function update(id: string, input: Partial<EmployeeInput>): Promise<DomainEmployee | null> {
    requireCapability(context, 'employees.manage', 'edit employees');
    const before = await get(id);
    if (!before) return null;

    const payload: Record<string, unknown> = {};
    if (input.fullName !== undefined) payload.full_name = input.fullName.trim();
    if (input.email !== undefined) payload.email = input.email.trim() || null;
    if (input.phone !== undefined) payload.phone = input.phone.trim() || null;
    if (input.userId !== undefined) payload.user_id = input.userId || null;
    if (input.employmentStatus !== undefined) payload.employment_status = input.employmentStatus;
    if (input.hireDate !== undefined) payload.hire_date = input.hireDate || null;
    if (input.endDate !== undefined) payload.end_date = input.endDate || null;
    if (input.notes !== undefined) payload.notes = input.notes || null;
    if (Object.keys(payload).length === 0) return before;
    payload.updated_at = new Date().toISOString();

    const { data, error } = await db
      .from('employees')
      .update(payload)
      .eq('id', id)
      .eq('organization_id', organizationId())
      .select()
      .single();
    if (error) throw translate(error);

    const employee = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.employeeUpdated,
      entityType: 'employee',
      entityId: id,
      before: auditView(before),
      after: auditView(employee),
    });
    return employee;
  }

  /**
   * Archived, never deleted. An employee record is employment history, and the
   * reasons not to destroy a customer's history apply at least as strongly to
   * a person who worked here.
   */
  async function archive(id: string, reason: string): Promise<DomainEmployee | null> {
    requireCapability(context, 'employees.manage', 'archive employees');
    const before = await get(id);
    if (!before) return null;

    const { data, error } = await db
      .from('employees')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId())
      .select()
      .single();
    if (error) throw translate(error);

    const employee = mapRow(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.employeeArchived,
      entityType: 'employee',
      entityId: id,
      before: auditView(before),
      after: auditView(employee),
      metadata: { reason: reason.trim() || null },
    });
    return employee;
  }

  return { list, get, shopsFor, create, update, archive };
}

function translate(error: { code?: string; message?: string }): Error {
  const message = String(error?.message ?? '');
  if (error?.code === '23505' && message.includes('employees_one_per_login')) {
    return new EmployeeError('That login already belongs to another employee in this business.');
  }
  if (error?.code === '23514' && message.includes('employees_status_check')) {
    return new EmployeeError('That is not a valid employment status.');
  }
  return error as Error;
}

export type EmployeeDomain = ReturnType<typeof createEmployeeDomain>;
