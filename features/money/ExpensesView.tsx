'use client';

/**
 * Expenses.
 *
 * What the business spends that is not stock. Parts bought for a job are
 * inventory and live in Parts Ordered; this is rent, fuel, tools, meals and
 * government fees — money that does not come back.
 *
 * Anyone can submit. Only the owner approves, and approving is also what
 * decides somebody gets paid back for something they bought out of pocket.
 * Totals are per currency and never added together.
 */

import { useEffect, useState, useCallback } from 'react';
import { Panel } from '@/components/Panel';
import {
  fetchExpenses, fetchExpenseCategories, submitExpense, decideExpense, markExpenseReimbursed,
  totalsByCurrency, byCategory, reimbursementsOwed,
  type Expense, type ExpenseCategory,
} from '@/services/expenseService';
import { fetchEmployees, type Employee } from '@/services/employeeService';
import { useShop } from '@/lib/useShop';
import { PRIORITY_CURRENCIES, formatMoney, DEFAULT_CURRENCY } from '@/lib/currencies';

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const m = (e as Record<string, unknown>)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + '01';

const STATUS_COLOR: Record<string, string> = {
  Pending:   '#d97706',
  Approved:  '#059669',
  Rejected:  '#dc2626',
  Cancelled: '#64748b',
};

const PAYMENT_METHODS = ['Cash', 'Bank transfer', 'Card', 'Mobile money', 'Other'];

export function ExpensesView() {
  const { role } = useShop();
  const canApprove = role === 'owner';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [range, setRange] = useState({ from: monthStart(), to: today() });
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    categoryId: '', amount: '', currency: DEFAULT_CURRENCY, spentOn: today(),
    payee: '', description: '', paymentMethod: 'Cash', paidByEmployee: '',
  });

  function notify(message: string) {
    setToast(message);
    setTimeout(() => setToast(''), 4000);
  }

  const load = useCallback(async () => {
    try {
      setExpenses(await fetchExpenses({ from: range.from, to: range.to }));
      setError('');
    } catch (e) {
      setError(errMsg(e, 'Could not load expenses.'));
    }
  }, [range.from, range.to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    fetchExpenseCategories().then(setCategories).catch(() => {});
    fetchEmployees().then(setEmployees).catch(() => {});
  }, []);

  const categoryName = (id: string | null) =>
    categories.find(c => c.id === id)?.name ?? 'Uncategorised';
  const employeeName = (id: string | null) =>
    id ? (employees.find(e => e.id === id)?.fullName ?? 'someone') : '';

  async function submit() {
    const amount = Number(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter an amount.'); return; }
    setBusy(true);
    try {
      await submitExpense({
        categoryId: form.categoryId || null,
        amount,
        currency: form.currency,
        spentOn: form.spentOn,
        payee: form.payee,
        description: form.description,
        paymentMethod: form.paymentMethod,
        paidByEmployee: form.paidByEmployee || null,
      });
      setShowForm(false);
      setForm({ ...form, amount: '', payee: '', description: '', paidByEmployee: '' });
      await load();
      notify('Submitted — waiting for approval');
      setError('');
    } catch (e) {
      setError(errMsg(e, 'That expense was not saved.'));
    } finally {
      setBusy(false);
    }
  }

  async function decide(expense: Expense, decision: 'Approved' | 'Rejected') {
    try {
      await decideExpense(expense.id, decision);
      await load();
      notify(
        decision === 'Approved' && expense.paidByEmployee
          ? 'Approved — ' + employeeName(expense.paidByEmployee) + ' is owed ' + formatMoney(expense.amount, expense.currency)
          : decision === 'Approved' ? 'Approved' : 'Rejected',
      );
    } catch (e) {
      setError(errMsg(e, 'That decision was not saved.'));
    }
  }

  async function reimburse(expense: Expense) {
    if (!confirm('Record ' + formatMoney(expense.amount, expense.currency) + ' paid back to ' + employeeName(expense.paidByEmployee) + '?')) return;
    try {
      await markExpenseReimbursed(expense.id);
      await load();
      notify('Recorded as paid back');
    } catch (e) {
      setError(errMsg(e, 'That was not recorded.'));
    }
  }

  const totals = totalsByCurrency(expenses);
  const owed = reimbursementsOwed(expenses);
  const pending = expenses.filter(e => e.status === 'Pending');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Expenses</h1>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ New expense'}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(220,38,38,0.1)', color: '#dc2626', fontSize: 13 }}>
          {error}
        </div>
      )}
      {toast && (
        <div style={{ padding: 12, marginBottom: 12, borderRadius: 8, background: 'rgba(5,150,105,0.1)', color: '#059669', fontSize: 13 }}>
          {toast}
        </div>
      )}

      {showForm && (
        <Panel title="New expense">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Category</label>
              <select className="input" value={form.categoryId} onChange={e => setForm({ ...form, categoryId: e.target.value })}>
                <option value="">— choose —</option>
                {categories.filter(c => c.isActive).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Amount</label>
              <input className="input" inputMode="decimal" value={form.amount}
                onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Currency</label>
              <select className="input" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                {PRIORITY_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Date</label>
              <input type="date" className="input" value={form.spentOn} max={today()}
                onChange={e => setForm({ ...form, spentOn: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>Paid to</label>
              <input className="input" value={form.payee} placeholder="Shop, landlord, garage…"
                onChange={e => setForm({ ...form, payee: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>How</label>
              <select className="input" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
                {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>What for</label>
              <input className="input" value={form.description}
                onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div style={{ gridColumn: '1/-1' }}>
              <label style={{ fontSize: 12, color: 'var(--muted)' }}>
                Paid out of someone&apos;s own pocket?
              </label>
              <select className="input" value={form.paidByEmployee}
                onChange={e => setForm({ ...form, paidByEmployee: e.target.value })}>
                <option value="">No — the business paid it directly</option>
                {employees.map(e => <option key={e.id} value={e.id}>Yes — {e.fullName} is owed it back</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" disabled={busy} onClick={submit}>
              {busy ? 'Saving…' : 'Submit'}
            </button>
          </div>
        </Panel>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block' }}>From</label>
          <input type="date" className="input" value={range.from}
            onChange={e => setRange({ ...range, from: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block' }}>To</label>
          <input type="date" className="input" value={range.to}
            onChange={e => setRange({ ...range, to: e.target.value })} />
        </div>
      </div>

      {(totals.length > 0 || owed.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 16 }}>
          {totals.map(t => (
            <div key={'t' + t.currency} className="card card-hero" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Approved {t.currency}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(t.amount, t.currency)}</div>
            </div>
          ))}
          {owed.map(o => (
            <div key={'o' + o.currency} className="card card-hero" style={{ padding: 14 }}>
              <div style={{ fontSize: 11, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Owed back {o.currency}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#d97706' }}>{formatMoney(o.amount, o.currency)}</div>
            </div>
          ))}
        </div>
      )}

      {totals.map(t => {
        const rows = byCategory(expenses, categories, t.currency);
        if (rows.length === 0) return null;
        return (
          <Panel key={'cat' + t.currency} title={'Where it went — ' + t.currency}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {rows.map(r => (
                <div key={r.category} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ minWidth: 170, fontSize: 13 }}>{r.category}</div>
                  <div style={{
                    flex: 1, height: 8, borderRadius: 999, background: 'var(--border)', overflow: 'hidden',
                  }}>
                    <div style={{
                      width: (t.amount > 0 ? (r.amount / t.amount) * 100 : 0) + '%',
                      height: '100%', background: 'var(--accent)',
                    }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, minWidth: 100, textAlign: 'right' }}>
                    {formatMoney(r.amount, t.currency)}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        );
      })}

      <Panel title={'Expenses' + (pending.length > 0 ? ' — ' + pending.length + ' waiting' : '')}>
        {expenses.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: 13 }}>
            Nothing recorded in this period.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {expenses.map(expense => (
              <div key={expense.id} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
                borderRadius: 8, border: '1px solid var(--border)', flexWrap: 'wrap',
              }}>
                <div style={{ fontWeight: 700, minWidth: 110 }}>
                  {formatMoney(expense.amount, expense.currency)}
                </div>
                <div style={{ fontSize: 13, minWidth: 140 }}>{categoryName(expense.categoryId)}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', minWidth: 90 }}>{expense.spentOn}</div>
                <div style={{ fontSize: 13, color: 'var(--muted)', flex: 1 }}>
                  {expense.payee}{expense.description ? ' · ' + expense.description : ''}
                  {expense.paidByEmployee && (
                    <span style={{ color: '#d97706' }}>
                      {' · '}{employeeName(expense.paidByEmployee)} paid
                      {expense.reimbursedOn ? ', repaid ' + expense.reimbursedOn : ', not yet repaid'}
                    </span>
                  )}
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 999,
                  color: STATUS_COLOR[expense.status],
                  border: '1px solid ' + STATUS_COLOR[expense.status],
                }}>
                  {expense.status}
                </span>
                {canApprove && expense.status === 'Pending' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn" style={{ fontSize: 12, color: '#059669', borderColor: '#059669' }}
                      onClick={() => decide(expense, 'Approved')}>Approve</button>
                    <button className="btn" style={{ fontSize: 12, color: '#dc2626', borderColor: '#dc2626' }}
                      onClick={() => decide(expense, 'Rejected')}>Reject</button>
                  </div>
                )}
                {canApprove && expense.status === 'Approved' && expense.paidByEmployee && !expense.reimbursedOn && (
                  <button className="btn" style={{ fontSize: 12 }} onClick={() => reimburse(expense)}>
                    Mark repaid
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
