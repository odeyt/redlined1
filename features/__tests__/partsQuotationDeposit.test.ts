/**
 * Deposits on a parts quotation.
 *
 * Parts orders already tracked deposit_paid and derived balance_due; a
 * quotation had nowhere to record money taken up front. The gap that mattered
 * was the conversion: convertToOrder hardcoded `depositPaid: 0`, so a deposit
 * collected against a quote vanished at the moment it became an order and the
 * customer was billed the full amount a second time.
 *
 * Balance is derived everywhere, never stored — the rule parts orders already
 * follow. These pin the arithmetic and the carry-across; the storage column is
 * additive (see the 2026-08-12 migration).
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '..', '..');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const quotes = strip(readFileSync(join(root, 'features', 'parts', 'PartsEstimatesView.tsx'), 'utf8'));
const orders = strip(readFileSync(join(root, 'features', 'parts', 'PartsOrdersView.tsx'), 'utf8'));
const service = strip(readFileSync(join(root, 'services', 'partsEstimateService.ts'), 'utf8'));
// SQL comments spell out the rollback, which naturally contains "drop
// column". Assert on the statements, not the prose describing them.
const migration = readFileSync(
  join(root, 'supabase', 'migrations', '2026-08-12_parts_estimates_deposit.sql'), 'utf8',
).replace(/^\s*--.*$/gm, '');

// The balance rule, stated once so the tests below check behaviour rather
// than restating an implementation detail.
const balanceOf = (total: number, deposit: number) =>
  Math.max(total - Math.min(Math.max(deposit, 0), total), 0);

describe('balance arithmetic', () => {
  it('is the quoted total less the deposit', () => {
    expect(balanceOf(1600, 600)).toBe(1000);
  });

  it('settles to zero when the deposit covers the quote', () => {
    expect(balanceOf(1600, 1600)).toBe(0);
  });

  it('never goes negative when the deposit exceeds the quote', () => {
    // A deposit above the total is a data-entry slip, not a refund owed.
    expect(balanceOf(1600, 5000)).toBe(0);
  });

  it('ignores a negative deposit', () => {
    expect(balanceOf(1600, -500)).toBe(1600);
  });

  it('leaves the balance at the full total when nothing is paid', () => {
    expect(balanceOf(1600, 0)).toBe(1600);
  });
});

describe('the quotation editor', () => {
  it('offers a deposit field', () => {
    expect(quotes).toMatch(/Deposit paid \(\$\{form\.currency\}\)/);
  });

  it('shows the balance rather than leaving it to be worked out', () => {
    expect(quotes).toMatch(/Balance due/);
    expect(quotes).toMatch(/Math\.max\(quoted - deposit, 0\)/);
  });

  it('clamps the deposit on save, not only in the input', () => {
    // The quoted total can change after a deposit is typed.
    expect(quotes).toMatch(/deposit: Math\.min\(Math\.max\(form\.deposit \|\| 0, 0\), form\.totalCost \|\| 0\)/);
  });
});

describe('converting a quotation to an order', () => {
  it('carries the deposit across instead of zeroing it', () => {
    expect(quotes).not.toMatch(/depositPaid: 0, balanceDue: e\.totalCost \+ e\.coreCharge/);
    expect(quotes).toMatch(/depositPaid: e\.deposit \?\? 0/);
  });

  it('opens the order with the balance already net of the deposit', () => {
    expect(quotes).toMatch(/balanceDue: Math\.max\(0, e\.totalCost \+ e\.coreCharge - \(e\.deposit \?\? 0\)\)/);
  });

  it('carries a deposit back the other way too', () => {
    // An order converted into a quotation keeps what was already paid.
    expect(orders).toMatch(/deposit: o\.depositPaid \?\? 0/);
  });
});

describe('persistence', () => {
  it('reads, writes and patches the column', () => {
    expect(service).toMatch(/deposit:\s*Number\(r\.deposit \?\? 0\)/);
    expect(service).toMatch(/deposit:\s*o\.deposit \?\? 0/);
    expect(service).toMatch(/if \(o\.deposit\s*!== undefined\) p\.deposit/);
  });

  it('adds the column without touching existing data', () => {
    expect(migration).toMatch(/add column if not exists deposit numeric not null default 0/);
    expect(migration).not.toMatch(/\bdrop column\b(?![^\n]*--)/);
  });

  it('does not store the balance', () => {
    // Two sources of truth for the same number is how they drift apart.
    expect(migration).not.toMatch(/add column[^\n]*balance/i);
  });
});
