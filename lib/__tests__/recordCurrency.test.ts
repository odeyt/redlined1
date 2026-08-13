/**
 * A record's currency must not disagree with its own lines.
 *
 * Found in production 2026-08-12: four quotations and five parts orders
 * stored a currency their line items contradicted — records saying THB while
 * every line was priced in LAK or USD. Setting a line's currency never
 * updated the record's, so it kept whatever the form defaulted to.
 *
 * The column is not decorative. It is what a deposit converts into, what
 * convert-to-order targets, and what totals report in. A LAK quote labelled
 * THB understates itself by roughly 25x to anything reading the column rather
 * than walking the lines.
 */
import { deriveRecordCurrency } from '../recordCurrency';

describe('when the lines agree', () => {
  it('adopts the currency they all name', () => {
    // The reported case: a quote defaulting to THB whose lines are all LAK.
    expect(deriveRecordCurrency([{ currency: 'LAK' }, { currency: 'LAK' }], 'THB')).toBe('LAK');
  });

  it('works for a single line', () => {
    expect(deriveRecordCurrency([{ currency: 'LAK' }], 'THB')).toBe('LAK');
  });

  it('is a no-op when they already match', () => {
    expect(deriveRecordCurrency([{ currency: 'THB' }], 'THB')).toBe('THB');
  });

  it('ignores surrounding whitespace', () => {
    expect(deriveRecordCurrency([{ currency: ' LAK ' }], 'THB')).toBe('LAK');
  });
});

describe('when the lines cannot answer, the record keeps what it had', () => {
  it('leaves mixed currencies alone', () => {
    // No single right answer; the multi-currency display already handles it.
    expect(deriveRecordCurrency([{ currency: 'LAK' }, { currency: 'THB' }], 'USD')).toBe('USD');
  });

  it('leaves it alone when any line names no currency', () => {
    // A blank line currency means "same as the record", so it cannot argue
    // with the record about what that is. Overriding from a partial set would
    // let one explicit line silently relabel the whole quote.
    expect(deriveRecordCurrency([{ currency: 'LAK' }, {}], 'THB')).toBe('THB');
    expect(deriveRecordCurrency([{ currency: 'LAK' }, { currency: '' }], 'THB')).toBe('THB');
    expect(deriveRecordCurrency([{ currency: 'LAK' }, { currency: null }], 'THB')).toBe('THB');
  });

  it('leaves it alone for no lines at all', () => {
    expect(deriveRecordCurrency([], 'THB')).toBe('THB');
    expect(deriveRecordCurrency(undefined, 'THB')).toBe('THB');
  });
});

describe('it always returns something usable', () => {
  it('falls back to USD rather than an empty currency', () => {
    // An empty currency reaches formatters and Intl, which throw on ''.
    expect(deriveRecordCurrency([], '')).toBe('USD');
    expect(deriveRecordCurrency([{ currency: '' }], '')).toBe('USD');
  });
});

describe('the services apply it', () => {
  const read = (p: string) =>
    require('fs').readFileSync(require('path').join(__dirname, '..', '..', p), 'utf8');

  it.each(['services/partsEstimateService.ts', 'services/partsOrderService.ts'])(
    '%s derives the stored currency from its lines', file => {
      const src = read(file);
      expect(src).toMatch(/deriveRecordCurrency\(items, o\.currency\)/);
      // The old form kept whatever the caller passed.
      expect(src).not.toMatch(/currency:\s*o\.currency \|\| 'USD'/);
    });
});
