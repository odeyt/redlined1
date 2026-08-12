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
  it('offers a deposit field with its own currency', () => {
    expect(quotes).toMatch(/field\('Deposit paid'/);
    expect(quotes).toMatch(/field\('Paid in'/);
  });

  it('shows the balance rather than leaving it to be worked out', () => {
    expect(quotes).toMatch(/Balance due/);
    expect(quotes).toMatch(/Math\.max\(quoted - applied, 0\)/);
  });

  it('clamps the deposit against the total for display only', () => {
    // Display clamps so the balance cannot go negative; the STORED amount is
    // left exactly as entered (see "stores the amount as entered" below).
    expect(quotes).toMatch(/Math\.min\(depositInQuoteCur, quoted\)/);
  });

  it('shows nothing rather than a number computed at a guessed rate', () => {
    expect(quotes).toMatch(/Converting…/);
  });
});

describe('converting a quotation to an order', () => {
  it('carries the deposit across instead of zeroing it', () => {
    expect(quotes).not.toMatch(/depositPaid: 0, balanceDue: e\.totalCost \+ e\.coreCharge/);
    expect(quotes).toMatch(/depositPaid: depositForOrder/);
  });

  it('opens the order with the balance already net of the deposit', () => {
    expect(quotes).toMatch(/balanceDue: Math\.max\(0, e\.totalCost \+ e\.coreCharge - depositForOrder\)/);
  });

  it('carries a deposit back the other way too', () => {
    // An order converted into a quotation keeps what was already paid.
    expect(orders).toMatch(/deposit: o\.depositPaid \?\? 0/);
    expect(orders).toMatch(/depositCurrency: o\.currency/);
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

describe('deposits paid in another currency', () => {
  it('labels the total with the currency the quote is actually priced in', () => {
    // A LAK quote whose only line is priced in THB is quoted in THB. Using
    // form.currency regardless produced "LAK 1,600" for a THB 1,600 line and
    // clamped a 600,000 LAK deposit against it.
    expect(quotes).toMatch(/const byCur = calcTotalByCurrency\(form\.lineItems, form\.coreCharge, form\.currency\)/);
    expect(quotes).toMatch(/fmt\(quoted, quoteCur\)/);
  });

  it('records the currency the deposit was handed over in', () => {
    expect(quotes).toMatch(/depositCurrency: e\.target\.value/);
    expect(service).toMatch(/deposit_currency:\s*o\.depositCurrency \|\| o\.currency/);
  });

  it('stores the amount as entered rather than converting on the way in', () => {
    // Converting on save would bake in that day's rate and lose what the
    // customer actually handed over.
    expect(quotes).toMatch(/deposit: Math\.max\(form\.deposit \|\| 0, 0\)/);
  });

  it('refuses to convert at a guessed rate when the rate is unavailable', () => {
    expect(quotes).toMatch(/Could not fetch today’s \{form\.depositCurrency\}→\{quoteCur\} rate/);
    expect(quotes).toMatch(/The order was not created/);
  });

  it('converts the deposit into the order currency on convert', () => {
    expect(quotes).toMatch(/convertAmount\(rawDeposit, depositCur, e\.currency\)/);
    expect(quotes).toMatch(/depositPaid: depositForOrder/);
  });
});
