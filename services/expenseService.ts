/**
 * Compatibility wrapper for the expense domain.
 *
 * Same shape as the other wrappers: build a context from the browser's shop
 * store, delegate. Nothing here talks to Supabase directly, so the capability
 * checks and the audit rows cannot be skipped by using the service instead of
 * the domain.
 */
import { browserDeps } from '@/lib/domain/browserAdapter';
import {
  createExpenseDomain, ExpenseError,
  totalsByCurrency, byCategory, reimbursementsOwed,
  type Expense, type ExpenseCategory, type ExpenseInput, type ExpenseStatus,
} from '@/lib/domain/expenses';

export type { Expense, ExpenseCategory, ExpenseInput, ExpenseStatus };
export { ExpenseError, totalsByCurrency, byCategory, reimbursementsOwed };

async function domain() {
  return createExpenseDomain(await browserDeps());
}

export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  return (await domain()).listCategories();
}

export async function fetchExpenses(
  options: { from?: string; to?: string; status?: ExpenseStatus; shopId?: string } = {},
): Promise<Expense[]> {
  return (await domain()).list(options);
}

export async function submitExpense(input: ExpenseInput): Promise<Expense> {
  return (await domain()).submit(input);
}

export async function decideExpense(
  id: string,
  decision: 'Approved' | 'Rejected',
  note = '',
): Promise<Expense> {
  return (await domain()).decide(id, decision, note);
}

/** Only for approved out-of-pocket claims — see the domain for why. */
export async function markExpenseReimbursed(id: string, on?: string): Promise<Expense> {
  return (await domain()).markReimbursed(id, on);
}
