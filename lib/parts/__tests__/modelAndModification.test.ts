/**
 * Model series and vehicle variant resolution.
 *
 * The production audit is the design constraint: engine is recorded on 6 of
 * 114 vehicles and trim on none. So `ambiguous` is the EXPECTED outcome for
 * most real vehicles, and these tests exist mostly to prove the resolver
 * refuses to pretend otherwise.
 */
import {
  matchModel, modelNameCovers, modelTokens, yearInWindow, type ProviderModel,
} from '../vehicleResolution/model';
import {
  matchModification, parseDisplacementL, parseCylinders,
} from '../vehicleResolution/modification';
import type { ModificationCandidate } from '../vehicleResolution/types';

const MB_MODELS: ProviderModel[] = [
  { id: 1, name: 'C-CLASS (W204)', yearFrom: 2007, yearTo: 2014 },
  { id: 2, name: 'C-CLASS (W205)', yearFrom: 2013, yearTo: 2021 },
  { id: 3, name: 'S-CLASS (W222)', yearFrom: 2013, yearTo: 2020 },
  { id: 4, name: 'C-MAX', yearFrom: 2010, yearTo: 2019 },
  { id: 5, name: 'E-CLASS (W212)', yearFrom: 2009, yearTo: 2016 },
];

describe('model series matching', () => {
  it('matches a series by its tokens', () => {
    const m = matchModel('S-Class', 2014, MB_MODELS);
    expect(m.status).toBe('matched');
    expect(m.model!.id).toBe(3);
  });

  it('never matches on a single shared letter', () => {
    // The brief's own example: a model must not be chosen because "C" appears
    // in the description. A bare letter is not a significant token.
    expect(modelNameCovers('C-MAX', 'C')).toBe(false);
    expect(modelNameCovers('C-CLASS (W205)', 'C')).toBe(false);
  });

  it('requires EVERY token, so S-Class does not match C-CLASS', () => {
    // Regression. An earlier version dropped insignificant tokens instead of
    // requiring one, so "S-Class" and "C-Class" both reduced to "class" and
    // every Mercedes series matched every other.
    expect(modelNameCovers('C-CLASS (W205)', 'S-Class')).toBe(false);
    expect(modelNameCovers('S-CLASS (W222)', 'S-Class')).toBe(true);
    expect(modelNameCovers('C-MAX', 'C-Class')).toBe(false);
  });

  it('does not confuse C-Class with C-MAX', () => {
    const m = matchModel('C-Class', 2014, MB_MODELS);
    const ids = m.status === 'ambiguous' ? m.candidates!.map(c => c.id) : [m.model!.id];
    expect(ids).not.toContain(4);
  });

  it('reports ambiguity when two generations overlap the year', () => {
    // W204 ends 2014 and W205 starts 2013. Both are legitimate for a 2014 car
    // and choosing one silently would be a guess.
    const m = matchModel('C-Class', 2014, MB_MODELS);
    expect(m.status).toBe('ambiguous');
    expect(m.candidates).toHaveLength(2);
  });

  it('the year narrows when the generations do not overlap', () => {
    const m = matchModel('C-Class', 2019, MB_MODELS);
    expect(m.status).toBe('matched');
    expect(m.model!.id).toBe(2);
  });

  it('says so when the series exists but not for that year', () => {
    // Different from "never found it", and the technician can act on it.
    const m = matchModel('E-Class', 2024, MB_MODELS);
    expect(m.status).toBe('no_match');
    expect(m.detail).toContain('2024');
  });

  it('is ambiguous rather than wrong when no year is recorded', () => {
    const m = matchModel('C-Class', undefined, MB_MODELS);
    expect(m.status).toBe('ambiguous');
    expect(m.detail).toContain('No year is recorded');
  });

  it('reports a missing model instead of guessing', () => {
    expect(matchModel('', 2014, MB_MODELS).status).toBe('missing_input');
  });

  describe('model designations — found live, not in fixtures', () => {
    // A real 2023 vehicle stored as "C260" matched NOTHING against 255 live
    // Mercedes series, because the catalogue names series by class and the
    // shop records what is written on the car.
    it('decomposes a designation and offers the class series', () => {
      const m = matchModel('C260', 2014, MB_MODELS);
      expect(m.status).toBe('ambiguous');
      expect(m.detail).toContain('designation');
      expect(m.candidates!.map(c => c.id)).toEqual(expect.arrayContaining([1, 2]));
    });

    it('NEVER resolves a designation outright, even down to one survivor', () => {
      // It matched on a class letter, and a class letter is not a series.
      // "C" fits both C-CLASS and C-MAX.
      const single = [{ id: 7, name: 'S-CLASS (W222)', yearFrom: 2013, yearTo: 2020 }];
      const m = matchModel('S350', 2015, single);
      expect(m.status).toBe('ambiguous');
      expect(m.model).toBeUndefined();
      expect(m.candidates).toHaveLength(1);
    });

    it('does not treat an ordinary model name as a designation', () => {
      // "S-Class" matches directly and must not take the designation path.
      expect(matchModel('S-Class', 2014, MB_MODELS).status).toBe('matched');
    });

    it('leaves the number for the modification step', () => {
      // 260 identifies the variant, and the provider puts "C 260" in the
      // variant description — not in the series name.
      const m = matchModel('C260', 2014, MB_MODELS);
      expect(m.candidates!.every(c => !c.name.includes('260'))).toBe(true);
    });

    it('still reports no_match when the class letter is unknown', () => {
      expect(matchModel('Z999', 2014, MB_MODELS).status).toBe('no_match');
    });
  });

  it('tokenises punctuation away', () => {
    expect(modelTokens('C-CLASS (W205)')).toEqual(['c', 'class', 'w205']);
  });

  it('treats an open-ended production window as still current', () => {
    expect(yearInWindow({ id: 9, name: 'X', yearFrom: 2020 }, 2026)).toBe(true);
    expect(yearInWindow({ id: 9, name: 'X' }, 2026)).toBe(true);
  });
});

describe('parsing what a service advisor typed', () => {
  it('reads litres', () => {
    expect(parseDisplacementL('3.5L V6')).toBe(3.5);
    expect(parseDisplacementL('5.5L 8-cyl')).toBe(5.5);
    expect(parseDisplacementL('2,0 TDI')).toBe(2.0);
  });

  it('reads cubic centimetres', () => {
    expect(parseDisplacementL('1796cc')).toBe(1.8);
    expect(parseDisplacementL('1991 cc')).toBe(2.0);
  });

  it('returns undefined rather than guessing', () => {
    expect(parseDisplacementL('petrol')).toBeUndefined();
    expect(parseDisplacementL('')).toBeUndefined();
  });

  it('reads cylinder counts', () => {
    expect(parseCylinders('3.5L V6')).toBe(6);
    expect(parseCylinders('4-cylinder')).toBe(4);
    expect(parseCylinders('2.0L I4')).toBe(4);
    expect(parseCylinders('turbo')).toBeUndefined();
  });
});

describe('variant resolution', () => {
  const C200_18: ModificationCandidate = {
    vehicleId: 101, description: 'C 200 (204.048) 1.8', yearFrom: 2007, yearTo: 2014,
    displacementL: 1.8, powerKw: 135, fuel: 'Petrol', engineCode: 'M271.860',
  };
  const C200_20: ModificationCandidate = {
    vehicleId: 102, description: 'C 200 (205.042) 2.0', yearFrom: 2014, yearTo: 2018,
    displacementL: 2.0, powerKw: 135, fuel: 'Petrol', engineCode: 'M274.920',
  };
  const C220_CDI: ModificationCandidate = {
    vehicleId: 103, description: 'C 220 CDI 2.1', yearFrom: 2007, yearTo: 2014,
    displacementL: 2.1, powerKw: 125, fuel: 'Diesel', engineCode: 'OM651',
  };

  it('resolves when the engine identifies one variant', () => {
    const m = matchModification({ year: 2014, engine: '1.8L' }, [C200_18, C200_20, C220_CDI]);
    expect(m.status).toBe('matched');
    expect(m.modification!.vehicleId).toBe(101);
    expect(m.detail).toContain('1.8L');
  });

  it('is INSUFFICIENT_DATA when only year is known — the common real case', () => {
    // 108 of 114 production vehicles have no engine recorded.
    const m = matchModification({ year: 2014 }, [C200_18, C200_20, C220_CDI]);
    expect(m.status).toBe('insufficient_data');
    expect(m.candidates).toHaveLength(3);
    expect(m.detail).toContain('No engine detail is recorded');
  });

  it('narrows by fuel when that is all there is', () => {
    const m = matchModification({ year: 2014, fuelType: 'Diesel' }, [C200_18, C200_20, C220_CDI]);
    expect(m.status).toBe('matched');
    expect(m.modification!.vehicleId).toBe(103);
  });

  it('stays ambiguous when the engine does not separate the variants', () => {
    // Same displacement, different drivetrain — the classic case where a
    // Tacoma 3.5 is still two different parts lists.
    const rwd: ModificationCandidate = { ...C200_20, vehicleId: 201, driveType: 'RWD' };
    const awd: ModificationCandidate = { ...C200_20, vehicleId: 202, driveType: '4MATIC' };
    const m = matchModification({ year: 2015, engine: '2.0L' }, [rwd, awd]);
    expect(m.status).toBe('ambiguous');
    expect(m.candidates).toHaveLength(2);
  });

  it('does NOT confirm a lone variant that year alone selected', () => {
    // One survivor reached without engine evidence is a catalogue that lists
    // one variant, not a confirmed resolution.
    const m = matchModification({ year: 2016 }, [C200_20]);
    expect(m.status).toBe('ambiguous');
    expect(m.detail).toContain('no engine detail is recorded');
  });

  it('absence in a candidate never eliminates it', () => {
    // The provider not publishing a displacement is not the provider saying
    // the displacement differs.
    const unknownEngine: ModificationCandidate = {
      vehicleId: 301, description: 'C 200', yearFrom: 2013, yearTo: 2016,
    };
    const m = matchModification({ year: 2014, engine: '2.0L' }, [unknownEngine, C200_18]);
    expect(m.candidates ?? [m.modification]).toEqual(
      expect.arrayContaining([expect.objectContaining({ vehicleId: 301 })]));
  });

  it('reports no_match when nothing was in production that year', () => {
    const m = matchModification({ year: 1998 }, [C200_18, C200_20]);
    expect(m.status).toBe('no_match');
    expect(m.detail).toContain('1998');
  });

  it('reports no_match on an empty catalogue list', () => {
    expect(matchModification({ year: 2014 }, []).status).toBe('no_match');
  });

  it('treats 1796cc and 1.8L as the same engine', () => {
    const m = matchModification({ year: 2010, engine: '1796cc' }, [C200_18, C220_CDI]);
    expect(m.status).toBe('matched');
    expect(m.modification!.vehicleId).toBe(101);
  });
});
