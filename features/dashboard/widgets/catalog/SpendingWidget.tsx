'use client';

/**
 * What the shop spent this month, and on what.
 *
 * Approved expenses only. A pending claim is a request, not a cost, and
 * counting it would overstate spending by whatever nobody has agreed to yet.
 *
 * Deliberately does NOT include parts orders: those are inventory, which comes
 * back as revenue when the part is fitted. Mixing the two produces a "spending"
 * figure that is wrong in a way nobody can trace.
 */

import { useEffect, useState } from 'react';
import {
  fetchExpenses, fetchExpenseCategories, totalsByCurrency, byCategory,
  reimbursementsOwed, type Expense, type ExpenseCategory,
} from '@/services/expenseService';
import { formatMoney } from '@/lib/currencies';
import type { WidgetProps } from '@/lib/dashboardWidgets/types';

const monthStart = () => new Date().toISOString().slice(0, 8) + '01';
const today = () => new Date().toISOString().slice(0, 10);

export function SpendingWidget({ onNav }: WidgetProps) {
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchExpenses({ from: monthStart(), to: today() }),
      fetchExpenseCategories(),
    ])
      .then(([e, c]) => { setExpenses(e); setCategories(c); })
      .catch(() => setFailed(true));
  }, []);

  if (failed) {
    return <div style={{ fontSize: 12, color: 'var(--muted)' }}>Could not load expenses.</div>;
  }
  if (!expenses) return null;

  const totals = totalsByCurrency(expenses);
  const owed = reimbursementsOwed(expenses);
  const pending = expenses.filter(e => e.status === 'Pending').length;

  if (totals.length === 0 && pending === 0) {
    return (
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Nothing recorded this month.{' '}
        <button className="btn" style={{ fontSize: 11, padding: '2px 8px' }}
          onClick={() => onNav('expenses')}>Add one</button>
      </div>
    );
  }

  // The busiest currency leads: showing three tiny breakdowns in a small
  // widget says less than one readable one.
  const main = totals[0];
  const rows = main ? byCategory(expenses, categories, main.currency).slice(0, 4) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {totals.map(t => (
          <div key={t.currency}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{formatMoney(t.amount, t.currency)}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.currency} this month</div>
          </div>
        ))}
      </div>

      {rows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {rows.map(r => (
            <div key={r.category} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 12, minWidth: 120, color: 'var(--muted)' }}>{r.category}</div>
              <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--border)' }}>
                <div style={{
                  width: (main.amount > 0 ? (r.amount / main.amount) * 100 : 0) + '%',
                  height: '100%', borderRadius: 999, background: 'var(--accent)',
                }} />
              </div>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{formatMoney(r.amount, main.currency)}</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12, marginTop: 'auto', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {pending > 0 && (
          <button className="btn" style={{ fontSize: 11, padding: '2px 8px', color: '#d97706', borderColor: '#d97706' }}
            onClick={() => onNav('expenses')}>
            {pending} waiting for approval
          </button>
        )}
        {owed.map(o => (
          <span key={o.currency} style={{ color: '#d97706' }}>
            {formatMoney(o.amount, o.currency)} owed back to staff
          </span>
        ))}
      </div>
    </div>
  );
}
