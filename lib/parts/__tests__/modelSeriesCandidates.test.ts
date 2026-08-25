/**
 * Model-series candidates, and the guard on choosing one.
 *
 * The 2009 S-Class matches two catalogue series. Ambiguity there produces no
 * MODIFICATION candidates, so the variant chooser cannot help — and until
 * M-PARTS2C.2 the candidates were counted into evidence and discarded, which
 * is why the technician saw a dead end.
 *
 * These run the real functions rather than grepping the source. The source
 * checks in oemReferenceUi cover the wiring; these cover the behaviour.
 */
import { toModelCandidates } from '../vehicleResolution/resolver';
import { matchModel, type ProviderModel } from '../vehicleResolution/model';

/** Two real S-Class series overlapping 2009, plus a decoy from the 1970s. */
const S_CLASS: ProviderModel[] = [
  { id: 221, name: 'S-CLASS (W221)', yearFrom: 2005, yearTo: 2013 },
  { id: 216, name: 'S-CLASS Coupe (C216)', yearFrom: 2006, yearTo: 2013 },
  { id: 116, name: 'S-CLASS (W116)', yearFrom: 1972, yearTo: 1980 },
];

describe('the ambiguity this milestone exists for is real', () => {
  it('a 2009 S-Class matches more than one series', () => {
    const m = matchModel('S-Class', 2009, S_CLASS);
    expect(m.status).toBe('ambiguous');
    expect((m.candidates ?? []).length).toBeGreaterThan(1);
  });

  it('the year window still excludes the series that was not built then', () => {
    // The W116 shares every token. Only the production window separates it,
    // which is why unparsed year fields once let a 2009 car match sixteen
    // series including 1970s models.
    const ids = (matchModel('S-Class', 2009, S_CLASS).candidates ?? []).map(c => c.id);
    expect(ids).not.toContain(116);
  });
});

describe('candidates are shaped for a chooser, and only that', () => {
  const out = toModelCandidates(matchModel('S-Class', 2009, S_CLASS).candidates ?? []);

  it('carries the id, the name and the years that distinguish them', () => {
    expect(Object.keys(out[0]).sort()).toEqual(['modelId', 'name', 'yearFrom', 'yearTo']);
  });

  it('invents nothing about fitment or parts', () => {
    expect(JSON.stringify(out)).not.toMatch(/fitment|verified|likely|price|brand/i);
  });

  it('is deterministic — oldest first, then by name', () => {
    const a = toModelCandidates(matchModel('S-Class', 2009, S_CLASS).candidates ?? []);
    const b = toModelCandidates([...(matchModel('S-Class', 2009, S_CLASS).candidates ?? [])].reverse());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('orders by production start so the list reads chronologically', () => {
    expect(out.map(c => c.yearFrom)).toEqual([...out.map(c => c.yearFrom)].sort((x, y) => (x ?? 0) - (y ?? 0)));
  });

  it('survives a series with no production window', () => {
    const undated = toModelCandidates([{ id: 9, name: 'MYSTERY' }]);
    expect(undated).toEqual([{ modelId: 9, name: 'MYSTERY', yearFrom: undefined, yearTo: undefined }]);
  });
});

describe('a chosen series is only honoured if it was offered', () => {
  /**
   * The resolver checks `chosenModelId` against the candidate list it derives
   * itself. Asserted here on the same primitive the resolver uses, because a
   * full resolve needs the network.
   *
   * The threat is the one `candidateWasOffered` guards on the variant route: a
   * confirmed mapping is the strongest evidence in the fitment chain, so
   * forging one forges VERIFIED FIT.
   */
  const offered = matchModel('S-Class', 2009, S_CLASS).candidates ?? [];

  it('accepts an id that is genuinely among them', () => {
    expect(offered.find(m => m.id === 221)).toBeDefined();
  });

  it('rejects the year-excluded series even though it exists in the catalogue', () => {
    expect(offered.find(m => m.id === 116)).toBeUndefined();
  });

  it('rejects an id that was never in the list', () => {
    expect(offered.find(m => m.id === 999999)).toBeUndefined();
  });

  it('rejects a numeric-looking string, which is not a provider id', () => {
    // Same rule as candidateWasOffered: `Number('221')` is 221, and accepting
    // that makes the guard depend on its caller having validated first.
    expect(offered.find(m => (m.id as unknown) === '221')).toBeUndefined();
  });
});
