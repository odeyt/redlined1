/**
 * What the business spends that is not stock.
 *
 * `parts_orders` already records money going to suppliers for parts, and that
 * is inventory: it comes back as revenue when the part is fitted. Rent, fuel,
 * tools, meals and government fees do not come back, and nothing recorded them
 * until now.
 *
 * ## Recorded in the currency it was paid in
 *
 * Same rule as payroll. No conversion; totals are per currency. A shop paying
 * rent in LAK, buying parts in THB and billing some customers in USD has three
 * real numbers, and one combined figure would be invented.
 *
 * ## Submitting is not approving
 *
 * Anyone may submit — a technician who bought fuel out of pocket has to be
 * able to. Approving is separate, and afterwards the amount, date, category
 * and location are frozen by a database trigger. What stays editable is the
 * reimbursement date, because money goes back to the person days later.
 */
import type { DomainDeps } from './db';
import { writeAuditEvent, AUDIT } from './audit';
import { requireCapability } from './context';

export type ExpenseStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';

export interface ExpenseCategory {
  id: string;
  organizationId: string;
  name: string;
  isActive: boolean;
}

export interface Expense {
  id: string;
  organizationId: string;
  shopId: string;
  categoryId: string | null;
  amount: number;
  currency: string;
  spentOn: string;
  payee: string;
  description: string;
  paymentMethod: string;
  status: ExpenseStatus;
  paidByEmployee: string | null;
  reimbursedOn: string | null;
  submittedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
}

export interface ExpenseInput {
  shopId?: string;
  categoryId: string | null;
  amount: number;
  currency: string;
  spentOn: string;
  payee?: string;
  description?: string;
  paymentMethod?: string;
  /** Set when a person paid out of their own pocket and is owed it back. */
  paidByEmployee?: string | null;
}

export class ExpenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpenseError';
  }
}

function mapCategory(row: Record<string, unknown>): ExpenseCategory {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: (row.name as string) ?? '',
    isActive: row.is_active !== false,
  };
}

function mapExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    shopId: row.shop_id as string,
    categoryId: (row.category_id as string) ?? null,
    amount: Number(row.amount ?? 0),
    currency: (row.currency as string) ?? 'USD',
    spentOn: row.spent_on as string,
    payee: (row.payee as string) ?? '',
    description: (row.description as string) ?? '',
    paymentMethod: (row.payment_method as string) ?? '',
    status: (row.status as ExpenseStatus) ?? 'Pending',
    paidByEmployee: (row.paid_by_employee as string) ?? null,
    reimbursedOn: (row.reimbursed_on as string) ?? null,
    submittedBy: (row.submitted_by as string) ?? null,
    decidedBy: (row.decided_by as string) ?? null,
    decidedAt: (row.decided_at as string) ?? null,
    decisionNote: (row.decision_note as string) ?? '',
    createdAt: (row.created_at as string) ?? '',
  };
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Approved spending, per currency. Never summed across them. */
export function totalsByCurrency(expenses: readonly Expense[]): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    // Only approved spending counts as a cost. A pending claim is a request,
    // and a rejected one never happened as far as the business is concerned.
    if (expense.status !== 'Approved') continue;
    totals.set(expense.currency, money((totals.get(expense.currency) ?? 0) + expense.amount));
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

/** Approved spending grouped by category, within one currency. */
export function byCategory(
  expenses: readonly Expense[],
  categories: readonly ExpenseCategory[],
  currency: string,
): { category: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.status !== 'Approved' || expense.currency !== currency) continue;
    const name = categories.find(c => c.id === expense.categoryId)?.name ?? 'Uncategorised';
    totals.set(name, money((totals.get(name) ?? 0) + expense.amount));
  }
  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** What is still owed back to people who paid out of pocket, per currency. */
export function reimbursementsOwed(expenses: readonly Expense[]): { currency: string; amount: number }[] {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.status !== 'Approved') continue;
    if (!expense.paidByEmployee) continue;      // the business paid it directly
    if (expense.reimbursedOn) continue;         // already handed back
    totals.set(expense.currency, money((totals.get(expense.currency) ?? 0) + expense.amount));
  }
  return [...totals.entries()].map(([currency, amount]) => ({ currency, amount }));
}

export function createExpenseDomain({ db, context }: DomainDeps) {
  function organizationId(): string {
    if (!context.organizationId) {
      throw new ExpenseError('This shop is not linked to a business yet, so expenses cannot be recorded.');
    }
    return context.organizationId;
  }

  async function listCategories(): Promise<ExpenseCategory[]> {
    const { data, error } = await db
      .from('expense_categories')
      .select('*')
      .eq('organization_id', organizationId())
      .order('name');
    if (error) throw error;
    return (data ?? []).map(mapCategory);
  }

  async function list(options: { from?: string; to?: string; status?: ExpenseStatus; shopId?: string } = {}): Promise<Expense[]> {
    // Gated on create, not read: everyone who can submit needs to see their
    // own, and RLS decides which rows come back. Someone with only
    // expenses.create sees theirs; a manager sees the shop's.
    requireCapability(context, 'expenses.create', 'see expenses');
    let query = db
      .from('expenses')
      .select('*')
      .eq('organization_id', organizationId());
    if (options.from) query = query.gte('spent_on', options.from);
    if (options.to) query = query.lte('spent_on', options.to);
    if (options.status) query = query.eq('status', options.status);
    if (options.shopId) query = query.eq('shop_id', options.shopId);
    const { data, error } = await query.order('spent_on', { ascending: false });
    if (error) throw error;
    return (data ?? []).map(mapExpense);
  }

  async function submit(input: ExpenseInput): Promise<Expense> {
    requireCapability(context, 'expenses.create', 'submit an expense');

    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new ExpenseError('An expense has to be for more than nothing.');
    }
    if (!input.currency) {
      throw new ExpenseError('An expense has to be in a currency.');
    }

    const shopId = input.shopId ?? context.shopId;
    if (!shopId) {
      throw new ExpenseError('No shop is selected, so there is nowhere to record this against.');
    }

    const { data, error } = await db
      .from('expenses')
      .insert({
        organization_id: organizationId(),
        shop_id: shopId,
        category_id: input.categoryId,
        amount: input.amount,
        currency: input.currency,
        spent_on: input.spentOn,
        payee: input.payee ?? '',
        description: input.description ?? '',
        payment_method: input.paymentMethod ?? '',
        status: 'Pending',
        paid_by_employee: input.paidByEmployee ?? null,
        submitted_by: context.actor.userId ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    const expense = mapExpense(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.expenseSubmitted,
      entityType: 'expense',
      entityId: expense.id,
      after: {
        amount: expense.amount, currency: expense.currency,
        spentOn: expense.spentOn, payee: expense.payee, shopId: expense.shopId,
      },
    });
    return expense;
  }

  async function decide(id: string, decision: 'Approved' | 'Rejected', note = ''): Promise<Expense> {
    requireCapability(context, 'expenses.approve', 'approve an expense');

    const { data, error } = await db
      .from('expenses')
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
    if (!data) throw new ExpenseError('That expense was already decided.');

    const expense = mapExpense(data);
    await writeAuditEvent(db, context, {
      action: decision === 'Approved' ? AUDIT.expenseApproved : AUDIT.expenseRejected,
      entityType: 'expense',
      entityId: expense.id,
      before: { status: 'Pending' },
      after: {
        status: expense.status, amount: expense.amount,
        currency: expense.currency, payee: expense.payee,
      },
    });
    return expense;
  }

  /**
   * Record that somebody was paid back.
   *
   * Only for expenses somebody paid out of their own pocket. Marking a
   * directly-paid expense as reimbursed would claim money moved when it did
   * not.
   */
  async function markReimbursed(id: string, on?: string): Promise<Expense> {
    requireCapability(context, 'expenses.approve', 'record a reimbursement');

    const { data, error } = await db
      .from('expenses')
      .update({ reimbursed_on: on ?? new Date().toISOString().slice(0, 10) })
      .eq('id', id)
      .eq('organization_id', organizationId())
      .eq('status', 'Approved')
      .not('paid_by_employee', 'is', null)
      .select()
      .single();
    if (error) throw error;
    if (!data) {
      throw new ExpenseError(
        'That expense is not an approved out-of-pocket claim, so there is nothing to pay back.',
      );
    }

    const expense = mapExpense(data);
    await writeAuditEvent(db, context, {
      action: AUDIT.expenseReimbursed,
      entityType: 'expense',
      entityId: expense.id,
      after: {
        amount: expense.amount, currency: expense.currency,
        paidByEmployee: expense.paidByEmployee, reimbursedOn: expense.reimbursedOn,
      },
    });
    return expense;
  }

  return { listCategories, list, submit, decide, markReimbursed };
}
