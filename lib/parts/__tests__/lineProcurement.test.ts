/**
 * Per-line procurement, EXECUTED.
 *
 * The money half of this is the part that can quietly go wrong: deposits live
 * on lines, lines carry their own currency, and a total that adds THB to USD
 * looks like a number and is fiction. So it is run, not grepped.
 */
import {
  lineState, lineDeposit, depositByCurrency, procurementCounts, hasProcurement,
  stateStyle, PROCUREMENT_STATES,
} from '../lineProcurement';

describe('a line written before this feature existed still reads', () => {
  it('defaults to not ordered', () => {
    // The JSONB precedent: an older row simply has no orderState.
    expect(lineState({})).toBe('not_ordered');
    expect(lineState(undefined)).toBe('not_ordered');
    expect(lineState({ orderState: null })).toBe('not_ordered');
  });

  it('defaults rather than trusting an unrecognised value', () => {
    // Hand-edited JSON, or an older client writing something else. The
    // quotation must still open.
    expect(lineState({ orderState: 'ORDERED' })).toBe('not_ordered');
    expect(lineState({ orderState: 'shipped' })).toBe('not_ordered');
    expect(lineState({ orderState: '' })).toBe('not_ordered');
  });

  it('reads the states it does know', () => {
    expect(lineState({ orderState: 'ordered' })).toBe('ordered');
    expect(lineState({ orderState: 'received' })).toBe('received');
  });

  it('has no deposit', () => {
    expect(lineDeposit({})).toBe(0);
    expect(lineDeposit(undefined)).toBe(0);
  });
});

describe('a deposit cannot quietly overcharge the customer', () => {
  it('floors a negative to zero', () => {
    // A negative deposit INCREASES the balance due. That is not a refund, it
    // is a typo that bills someone extra.
    expect(lineDeposit({ deposit: -500 })).toBe(0);
  });

  it('floors a non-finite value to zero', () => {
    expect(lineDeposit({ deposit: NaN })).toBe(0);
    expect(lineDeposit({ deposit: Infinity })).toBe(0);
    expect(lineDeposit({ deposit: 'abc' as unknown as number })).toBe(0);
  });

  it('keeps a real amount, including fractions', () => {
    expect(lineDeposit({ deposit: 3500 })).toBe(3500);
    expect(lineDeposit({ deposit: 12.5 })).toBe(12.5);
  });
});

describe('deposits total per currency, never across them', () => {
  /**
   * THE rule. `calcTotalByCurrency` already refuses to add a THB line to a
   * USD line; this must not invent a looser rule beside it.
   */
  it('keeps two currencies apart', () => {
    const items = [
      { currency: 'THB', deposit: 3500 },
      { currency: 'USD', deposit: 100 },
      { currency: 'THB', deposit: 500 },
    ];
    expect(depositByCurrency(items, 'THB')).toEqual({ THB: 4000, USD: 100 });
  });

  it('never produces a single blended number', () => {
    const out = depositByCurrency(
      [{ currency: 'THB', deposit: 3500 }, { currency: 'USD', deposit: 100 }], 'THB');
    expect(Object.keys(out)).toHaveLength(2);
    expect(Object.values(out)).not.toContain(3600);
  });

  it('collapses to one entry when the sheet is single-currency', () => {
    // The normal case, and the one the existing deposit + FX path already
    // handles. It must stay exactly that shape.
    const items = [
      { currency: 'THB', deposit: 3500 },
      { currency: 'THB', deposit: 0 },
      { currency: 'THB' },
    ];
    expect(depositByCurrency(items, 'THB')).toEqual({ THB: 3500 });
  });

  it('falls back to the quote currency for a line that carries none', () => {
    expect(depositByCurrency([{ deposit: 250 }], 'LAK')).toEqual({ LAK: 250 });
    expect(depositByCurrency([{ currency: '  ', deposit: 250 }], 'LAK')).toEqual({ LAK: 250 });
  });

  it('omits a currency whose deposits are all zero', () => {
    // So an empty object means "nothing paid" and the caller needs no second
    // check.
    expect(depositByCurrency([{ currency: 'THB', deposit: 0 }], 'THB')).toEqual({});
    expect(depositByCurrency([], 'THB')).toEqual({});
    expect(depositByCurrency(null, 'THB')).toEqual({});
  });

  it('ignores a negative line rather than subtracting it from the total', () => {
    expect(depositByCurrency(
      [{ currency: 'THB', deposit: 3500 }, { currency: 'THB', deposit: -1000 }], 'THB'))
      .toEqual({ THB: 3500 });
  });
});

describe('the summary answers both questions that were asked', () => {
  const sheet = [
    { orderState: 'received', currency: 'THB', deposit: 3500 },
    { orderState: 'ordered', currency: 'THB' },
    { orderState: 'ordered', currency: 'THB', deposit: 500 },
    { currency: 'THB' },
    {},
  ];

  it('counts what is ordered and what has arrived', () => {
    expect(procurementCounts(sheet)).toEqual({ not_ordered: 2, ordered: 2, received: 1 });
  });

  it('counts an unknown state as not ordered rather than dropping the row', () => {
    // The counts must always add up to the number of lines, or the summary
    // contradicts the table under it.
    const odd = [{ orderState: 'nonsense' }, { orderState: 'ordered' }];
    const c = procurementCounts(odd);
    expect(c.not_ordered + c.ordered + c.received).toBe(odd.length);
  });

  it('says what has been paid, per currency', () => {
    expect(depositByCurrency(sheet, 'THB')).toEqual({ THB: 4000 });
  });
});

describe('the summary stays off a sheet nobody has started buying for', () => {
  it('is hidden on a fresh quotation', () => {
    expect(hasProcurement([{ currency: 'THB' }, { currency: 'THB' }], 'THB')).toBe(false);
    expect(hasProcurement([], 'THB')).toBe(false);
  });

  it('appears as soon as one line is ordered', () => {
    expect(hasProcurement([{ orderState: 'ordered' }], 'THB')).toBe(true);
  });

  it('appears as soon as one deposit is recorded, even if nothing is ordered', () => {
    // Paying before ordering is the normal sequence with these vendors.
    expect(hasProcurement([{ currency: 'THB', deposit: 500 }], 'THB')).toBe(true);
  });
});

describe('every state is displayable and named', () => {
  it('states its status in words, not colour alone', () => {
    for (const s of PROCUREMENT_STATES) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.fg).toBeTruthy();
    }
  });

  it('has a style for every state, and a safe fallback', () => {
    for (const s of PROCUREMENT_STATES) expect(stateStyle(s.value).value).toBe(s.value);
    expect(stateStyle('nonsense' as never).value).toBe('not_ordered');
  });

  it('offers the states in the order work moves through them', () => {
    expect(PROCUREMENT_STATES.map(s => s.value))
      .toEqual(['not_ordered', 'ordered', 'received']);
  });
});
