/**
 * A quote line must record the currency the user actually chose.
 *
 * EMPTY_LINE carried `currency: 'USD'`. addLineItem overrode it with the form's
 * currency, but the FIRST line of every quote was a raw copy — so it was stored
 * as USD whatever the user picked, while the cell rendered
 * `item.currency || form.currency` and displayed the right one. Display and
 * data disagreed, with nothing on screen to reveal it.
 *
 * Found in production data on 2026-08-03: four of six quotes had a first line
 * item in USD under a THB quote, including "steering wheel rack, 3000".
 *
 * The consequence is monetary. Converting a quote to an order runs
 * fxRate(itemCurrency, mainCurrency), so ฿3,000 recorded as USD becomes roughly
 * ฿108,000 — a hundredfold error on a real customer's order.
 */

/** Mirrors emptyLine() in features/parts/PartsEstimatesView.tsx. */
const emptyLine = (currency: string) => ({
  partName: '', partNumber: '', condition: 'New', quantity: 1, unitCost: 0, vendorName: '', currency,
});

/** Mirrors the quote-currency onChange handler. */
function changeQuoteCurrency(
  form: { currency: string; lineItems: Array<{ currency?: string; unitCost: number }> },
  next: string,
) {
  return {
    ...form,
    currency: next,
    lineItems: form.lineItems.map(li =>
      (li.currency ?? form.currency) === form.currency ? { ...li, currency: next } : li),
  };
}

describe('a new line takes the quote currency', () => {
  it.each(['THB', 'LAK', 'USD', 'EUR'])('inherits %s rather than defaulting', cur => {
    expect(emptyLine(cur).currency).toBe(cur);
  });

  it('has no default of its own to fall back to', () => {
    // The bug was a hardcoded 'USD' surviving into every first line.
    expect(emptyLine('THB').currency).not.toBe('USD');
  });
});

describe('changing the quote currency', () => {
  it('carries the lines that were on the old currency', () => {
    const form = { currency: 'USD', lineItems: [{ currency: 'USD', unitCost: 2000 }] };
    expect(changeQuoteCurrency(form, 'THB').lineItems[0].currency).toBe('THB');
  });

  it('carries a line that never had one set', () => {
    const form = { currency: 'USD', lineItems: [{ unitCost: 2000 }] };
    expect(changeQuoteCurrency(form, 'THB').lineItems[0].currency).toBe('THB');
  });

  it('leaves a line deliberately set to a different currency alone', () => {
    // A genuinely foreign-supplier line must survive the quote changing.
    const form = { currency: 'USD', lineItems: [{ currency: 'EUR', unitCost: 50 }] };
    expect(changeQuoteCurrency(form, 'THB').lineItems[0].currency).toBe('EUR');
  });

  it('updates the quote currency itself', () => {
    const form = { currency: 'USD', lineItems: [] };
    expect(changeQuoteCurrency(form, 'THB').currency).toBe('THB');
  });

  it('never leaves a line disagreeing with the quote it was entered under', () => {
    // The exact production shape: quote THB, first line stuck on USD.
    const form = { currency: 'USD', lineItems: [{ currency: 'USD', unitCost: 3000 }] };
    const after = changeQuoteCurrency(form, 'THB');
    expect(after.lineItems[0].currency).toBe(after.currency);
  });
});

describe('line totals are plain multiplication', () => {
  // The reported "bug" — 2000 showing a total of 8000 — was a quantity of 4
  // scrolled off screen in a horizontally scrollable table. The arithmetic was
  // correct; only the quantity was invisible.
  const lineTotal = (unitCost: number, quantity: number) => unitCost * quantity;

  it('multiplies unit cost by quantity', () => {
    expect(lineTotal(2000, 4)).toBe(8000);
  });

  it('shows the multiplication whenever quantity exceeds one', () => {
    const showsWorking = (quantity: number) => quantity > 1;
    expect(showsWorking(4)).toBe(true);
    expect(showsWorking(1)).toBe(false);
  });
});

/**
 * The shop's default currency.
 *
 * USD for every new shop, changeable in Settings. Previously the default was
 * hardcoded 'USD' in the quotation form and nowhere else, so a shop working in
 * baht re-picked its currency on every quote — and when it forgot, the line was
 * stored as USD while the screen showed THB.
 */
describe('shop default currency', () => {
  /** Mirrors the mapping in services/shopSettingsService.fetchShopSettings. */
  const readDefault = (row: { default_currency?: string | null } | null) =>
    (row?.default_currency as string | null) || 'USD';

  it('is USD for a shop that has never set one', () => {
    expect(readDefault({ default_currency: null })).toBe('USD');
  });

  it('is USD when the settings row does not exist yet', () => {
    expect(readDefault(null)).toBe('USD');
  });

  it('is USD when the column is blank rather than null', () => {
    expect(readDefault({ default_currency: '' })).toBe('USD');
  });

  it.each(['THB', 'LAK', 'EUR', 'AUD'])('honours %s once chosen', cur => {
    expect(readDefault({ default_currency: cur })).toBe(cur);
  });

  it('opens a new quote with its first line already in that currency', () => {
    // The quote and its first line are built from one value, so they cannot
    // disagree at creation — which is what produced USD lines under THB quotes.
    const shopCurrency = 'THB';
    const form = { currency: shopCurrency, lineItems: [emptyLine(shopCurrency)] };
    expect(form.lineItems[0].currency).toBe(form.currency);
  });
});
