/**
 * The gate on vehicle-scoped search.
 *
 * Two ways to get this wrong, and both cost something real: run it when the
 * vehicle is not actually pinned, and Redlined1 presents a guess as a
 * vehicle-specific answer; run it alongside an OEM lookup, and every search
 * spends two provider calls to answer one question.
 */
import { vehicleFirstTarget } from '../vehicleFirst/gate';

const resolved = { resolutionStatus: 'resolved' as const, vehicleId: 5501 };

describe('a description search on a pinned vehicle', () => {
  it('is scoped to the resolved variant', () => {
    expect(vehicleFirstTarget({}, resolved)).toBe(5501);
  });
});

describe('a search that already knows the part number is not scoped', () => {
  it.each([
    ['an OEM number', { oemNumber: 'A0004205502' }],
    ['a manufacturer part number', { manufacturerPartNumber: 'P85020' }],
    ['both', { oemNumber: 'A0004205502', manufacturerPartNumber: 'P85020' }],
  ])('%s takes the identity path instead', (_label, input) => {
    // Not a limitation — oem_search answers identity directly and better.
    expect(vehicleFirstTarget(input, resolved)).toBeUndefined();
  });
});

describe('an unpinned vehicle is never scoped to', () => {
  it.each([
    ['ambiguous', 'ambiguous'],
    ['insufficient_data', 'insufficient_data'],
    ['not_found', 'not_found'],
  ] as const)('refuses %s even with an id present', (_label, status) => {
    // `ambiguous` is the dangerous one: it CARRIES a vehicleId, so a check
    // that only looked for an id would happily scope to a candidate the
    // technician has not chosen.
    expect(vehicleFirstTarget({}, { resolutionStatus: status, vehicleId: 5501 }))
      .toBeUndefined();
  });

  it('refuses a missing resolution', () => {
    expect(vehicleFirstTarget({}, undefined)).toBeUndefined();
  });
});

describe('a resolved status is not on its own enough', () => {
  it.each([
    ['zero — the variant reader\'s fallback for a row with no id', 0],
    ['negative', -1],
    ['fractional', 12.5],
    ['NaN', NaN],
    ['absent', undefined],
  ])('refuses %s', (_label, vehicleId) => {
    expect(vehicleFirstTarget({}, { resolutionStatus: 'resolved', vehicleId }))
      .toBeUndefined();
  });

  it('refuses an id that arrived as a string', () => {
    // Same rule as candidateWasOffered: a numeric-looking string is not a
    // provider id, and coercing one is how an untrusted value gets in.
    expect(vehicleFirstTarget(
      {}, { resolutionStatus: 'resolved', vehicleId: '5501' as unknown as number },
    )).toBeUndefined();
  });
});

describe('it returns the id rather than a yes', () => {
  it('so the caller cannot pass the gate and scope to something else', () => {
    // A boolean gate leaves the caller to fetch the id again, and that second
    // read is where the two drift apart.
    expect(typeof vehicleFirstTarget({}, resolved)).toBe('number');
  });
});
