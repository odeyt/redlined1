/**
 * Compatibility wrapper for the employee domain.
 *
 * Same shape as the other service wrappers: build a context from the browser's
 * shop store, delegate. There is no UI on this yet — the model and its
 * back-fill are the milestone, and a screen arrives with attendance, when
 * there is something worth looking at.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createEmployeeDomain, EMPLOYMENT_STATUSES, EmployeeError,
  type DomainEmployee, type EmployeeInput, type EmploymentStatus,
} from '@/lib/domain/employees';

export type Employee = DomainEmployee;
export type { EmployeeInput, EmploymentStatus };
export { EMPLOYMENT_STATUSES, EmployeeError };

async function domain() {
  return createEmployeeDomain(await browserDeps());
}

export async function fetchEmployees(
  options: { includeArchived?: boolean } = {},
): Promise<Employee[]> {
  return (await domain()).list(options);
}

export async function fetchEmployee(id: string): Promise<Employee | null> {
  return (await domain()).get(id);
}

/** The shops a person works at, from the per-shop technician directory. */
export async function fetchEmployeeShops(id: string): Promise<string[]> {
  return (await domain()).shopsFor(id);
}

export async function createEmployee(input: EmployeeInput): Promise<Employee> {
  return (await domain()).create(input);
}

export async function updateEmployee(
  id: string, input: Partial<EmployeeInput>,
): Promise<Employee | null> {
  return (await domain()).update(id, input);
}

export async function archiveEmployee(id: string, reason: string): Promise<Employee | null> {
  return (await domain()).archive(id, reason);
}
