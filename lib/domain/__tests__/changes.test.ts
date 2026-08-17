/**
 * A save with nothing edited is not a change.
 *
 * Two identical customer.updated rows landed in the production audit trail
 * during testing — same name before and after — because the form was saved
 * twice without being edited. The log is only useful if scanning it shows what
 * actually happened, so a no-op must not appear in it at all.
 */
import { isSameValue, changedFields, isNoOp } from '../changes';

describe('comparing values', () => {
  it('treats null, undefined and empty string as the same', () => {
    // The database stores an untouched optional field as NULL; a form hands
    // back ''. Calling that a change would defeat the purpose.
    for (const [a, b] of [[null, ''], ['', undefined], [null, undefined], [undefined, '']]) {
      expect(isSameValue(a, b)).toBe(true);
    }
  });

  it('compares arrays and objects by content', () => {
    // A re-parsed jsonb column is never the same object it came from, so
    // identity comparison would report every save as a change.
    expect(isSameValue(['a', 'b'], ['a', 'b'])).toBe(true);
    expect(isSameValue([{ qty: 1 }], [{ qty: 1 }])).toBe(true);
    expect(isSameValue(['a'], ['b'])).toBe(false);
    expect(isSameValue([{ qty: 1 }], [{ qty: 2 }])).toBe(false);
  });

  it('does not confuse a real value with an empty one', () => {
    expect(isSameValue('Ai Joy', '')).toBe(false);
    expect(isSameValue(0, null)).toBe(false);       // a zero amount is a value
    expect(isSameValue(false, null)).toBe(false);
  });
});

describe('working out what changed', () => {
  const customer = { name: 'Ai Joy', phone: '', tags: ['fleet'], discount: 0 };

  it('returns nothing when nothing differs', () => {
    expect(changedFields(customer, { name: 'Ai Joy', phone: '', tags: ['fleet'] })).toEqual({});
    expect(isNoOp(customer, { name: 'Ai Joy', phone: '' })).toBe(true);
  });

  it('returns only the fields that differ', () => {
    expect(changedFields(customer, { name: 'Ai Joy', phone: '020 555' }))
      .toEqual({ phone: '020 555' });
  });

  it('ignores keys the caller did not mention', () => {
    // A partial update says nothing about the fields it omits, which is
    // different from saying they should be cleared.
    expect(changedFields(customer, { phone: '020 555' })).toEqual({ phone: '020 555' });
  });

  it('skips explicit undefined', () => {
    expect(changedFields(customer, { name: undefined })).toEqual({});
  });

  it('notices a zero replacing a number', () => {
    // Financial fields: setting a discount to 0 IS a change and must be kept.
    expect(changedFields({ discount: 50 }, { discount: 0 })).toEqual({ discount: 0 });
    expect(isNoOp({ discount: 50 }, { discount: 0 })).toBe(false);
  });

  it('treats an unreadable current record as changed', () => {
    // Nothing to compare against — proceeding is safer than silently skipping
    // a write the caller asked for.
    expect(isNoOp(null, { name: 'x' })).toBe(false);
    expect(changedFields(null, { name: 'x' })).toEqual({ name: 'x' });
  });
});
