/**
 * Every way into invoicing asks the same two questions.
 *
 * The first fix gated the Repair Orders screen and stopped there. The manager
 * re-reported the bug from a screenshot showing "Create Invoice" still sitting
 * in the TOP BAR — a different component, still gated on `!isTech`, which
 * reads as a permission check and is not one.
 *
 * Sweeping for it found two more surfaces gated on nothing whatsoever:
 * the vehicle drawer and parts orders, both reachable by this manager
 * according to their sidebar.
 *
 * So the rule is pinned across all four rather than per screen. A fifth entry
 * point added later fails here rather than in a screenshot.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

const SURFACES: Array<{ file: string; invoice: boolean; estimate: boolean }> = [
  { file: 'components/Header.tsx',                        invoice: true,  estimate: false },
  { file: 'features/repair-orders/RepairOrdersView.tsx',  invoice: true,  estimate: true  },
  { file: 'features/vehicles/VehiclesView.tsx',           invoice: true,  estimate: false },
  { file: 'features/parts/PartsOrdersView.tsx',           invoice: true,  estimate: true  },
];

describe('every invoice entry point is gated on capability AND module', () => {
  for (const s of SURFACES) {
    const src = read(s.file);

    if (s.invoice) {
      it(`${s.file} derives canInvoice from both systems`, () => {
        expect(src).toContain("can('invoices.manage') && canUseModule('invoices')");
      });
    }

    if (s.estimate) {
      it(`${s.file} derives canEstimate from both systems`, () => {
        expect(src).toContain("can('estimates.manage') && canUseModule('estimates')");
      });
    }

    it(`${s.file} resolves permissions through the shared hook`, () => {
      // Not a second local copy of the rule. One hook, one answer, so the
      // button and the server's refusal cannot disagree.
      expect(src).toContain("from '@/lib/auth/useCapabilities'");
    });
  }
});

describe('the buttons themselves are behind the gate, not just the variable', () => {
  it('the top bar renders Create Invoice only when canInvoice', () => {
    const src = read('components/Header.tsx');
    const btn = src.indexOf('<Icon name="invoice" /> Create Invoice');
    expect(btn).toBeGreaterThan(-1);
    // The nearest opening guard above the button is the capability one.
    expect(src.slice(0, btn)).toMatch(/\{canInvoice && \($/m);
  });

  it('no invoice entry point is gated on role alone', () => {
    for (const s of SURFACES) {
      const src = read(s.file);
      // `!isTech` may still gate money columns and Return Job — those are
      // genuinely about role. It must not be the ONLY thing in front of an
      // invoice or estimate button.
      expect(src).not.toMatch(/\{!isTech && \(\s*\n\s*<button[^>]*>\s*\n?\s*<Icon name="invoice"/);
    }
  });

  it('the vehicle drawer no longer offers it to everyone', () => {
    const src = read('features/vehicles/VehiclesView.tsx');
    expect(src).toContain('{canInvoice && <button onClick={onCreateInvoice}');
  });

  it('parts orders gates both of its button pairs', () => {
    const src = read('features/parts/PartsOrdersView.tsx');
    expect((src.match(/\{canInvoice && <button/g) ?? []).length).toBe(2);
    expect((src.match(/\{canEstimate && <button/g) ?? []).length).toBe(2);
  });
});
