/**
 * Vehicle data quality — completeness, conflicts, and the line between them.
 *
 * These call the analyzer rather than reading its source. It is pure by
 * design precisely so this is possible.
 */
import {
  analyzeVehicleQuality, labelConflict, neverEquivalentMarques, sameMarque,
  qualitySummary, CORE_IDENTITY_FIELDS, FITMENT_ENRICHMENT_FIELDS,
  NON_FITMENT_FIELDS, type QualityVehicle,
} from '../quality';

const tacoma: QualityVehicle = {
  id: 'v1', year: 2019, make: 'Toyota', model: 'Tacoma',
};

const complete: QualityVehicle = {
  id: 'v2', year: 2009, make: 'MERCEDES-BENZ', model: 'S-Class',
  engine: '5.5L 8-cyl', engineCode: 'M 273.961', displacementL: 5.5,
  cylinders: 8, fuelType: 'Petrol', transmission: 'Automatic', trim: 'S 500',
};

describe('incomplete is not invalid', () => {
  it('a Tacoma with no engine is INCOMPLETE, never INVALID', () => {
    const q = analyzeVehicleQuality(tacoma);
    expect(q.status).toBe('INCOMPLETE');
    expect(['COMPLETE', 'INCOMPLETE', 'CONFLICT']).toContain(q.status);
  });

  it('still counts as resolvable, because year/make/model are there', () => {
    // Resolution can proceed and the technician can pick a variant. Missing
    // engine narrows less; it does not block.
    expect(analyzeVehicleQuality(tacoma).resolvable).toBe(true);
  });

  it('says what to do rather than naming a state', () => {
    expect(qualitySummary(analyzeVehicleQuality(tacoma)))
      .toBe('Vehicle record incomplete for precise parts matching.');
    expect(qualitySummary(analyzeVehicleQuality(tacoma))).not.toMatch(/invalid/i);
  });

  it('a fully described vehicle is COMPLETE', () => {
    const q = analyzeVehicleQuality(complete);
    expect(q.status).toBe('COMPLETE');
    expect(q.completeness).toBe(1);
    expect(q.missingFields).toEqual([]);
  });
});

describe('core identity is a precondition, not a score', () => {
  it('a vehicle with no make is INCOMPLETE and not resolvable', () => {
    const q = analyzeVehicleQuality({ id: 'v3', year: 2019, model: 'Tacoma' });
    expect(q.status).toBe('INCOMPLETE');
    expect(q.resolvable).toBe(false);
    expect(q.missingFields.some(m => m.field === 'make')).toBe(true);
  });

  it('says the core is what is needed, not that the record is broken', () => {
    const q = analyzeVehicleQuality({ id: 'v3', year: 2019, model: 'Tacoma' });
    expect(qualitySummary(q)).toContain('Year, make and model are needed');
  });

  it('a rich record still missing its core is not COMPLETE', () => {
    // Enrichment cannot compensate for not knowing which car it is.
    const q = analyzeVehicleQuality({ ...complete, make: undefined });
    expect(q.status).not.toBe('COMPLETE');
    expect(q.resolvable).toBe(false);
  });
});

describe('non-fitment fields carry no penalty', () => {
  it('a missing plate does not affect quality', () => {
    const withPlate = analyzeVehicleQuality({ ...complete, plate: 'ABC-123' } as QualityVehicle);
    const without = analyzeVehicleQuality(complete);
    expect(withPlate.status).toBe(without.status);
    expect(withPlate.completeness).toBe(without.completeness);
  });

  it('plate, mileage, status and label are declared non-fitment', () => {
    for (const f of NON_FITMENT_FIELDS) {
      expect(FITMENT_ENRICHMENT_FIELDS as readonly string[]).not.toContain(f);
      expect(CORE_IDENTITY_FIELDS as readonly string[]).not.toContain(f);
    }
  });

  it('a missing VIN does not make a vehicle unusable', () => {
    // VIN is special: high coverage, but its absence must not block parts.
    const q = analyzeVehicleQuality({ ...complete, vin: undefined });
    expect(q.status).toBe('COMPLETE');
    expect(q.resolvable).toBe(true);
  });
});

describe('marques that share parts are still different marques', () => {
  it.each([
    ['Toyota', 'Lexus'], ['Honda', 'Acura'], ['Volkswagen', 'Audi'],
    ['Nissan', 'Infiniti'], ['Hyundai', 'Kia'],
  ])('%s is never equivalent to %s', (a, b) => {
    expect(neverEquivalentMarques(a, b)).toBe(true);
    expect(neverEquivalentMarques(b, a)).toBe(true);
    expect(sameMarque(a, b)).toBe(false);
  });

  it('the same marque spelled differently is the same marque', () => {
    expect(sameMarque('MERCEDES-BENZ', 'Mercedes Benz')).toBe(true);
    expect(neverEquivalentMarques('MERCEDES-BENZ', 'Mercedes Benz')).toBe(false);
  });

  it('unrelated marques are simply not equal', () => {
    expect(sameMarque('Toyota', 'Ford')).toBe(false);
    // Not "never equivalent" — that list is about RELATED marques a fuzzy
    // matcher would wrongly merge.
    expect(neverEquivalentMarques('Toyota', 'Ford')).toBe(false);
  });
});

describe('a display label may raise a question, never answer one', () => {
  it('flags the real case: label says C 200, record says S-Class', () => {
    const c = labelConflict({
      id: 'v4', make: 'Mercedes Benz', model: 'S-Class',
      label: 'Mercedes Benz C 200 #1112 2014',
    });
    expect(c).not.toBeNull();
    expect(c!.field).toBe('model');
    expect(c!.currentValue).toBe('S-Class');
    expect(c!.otherSource).toBe('display_label');
  });

  it('makes that vehicle CONFLICT rather than merely incomplete', () => {
    const q = analyzeVehicleQuality({
      id: 'v4', year: 2014, make: 'Mercedes Benz', model: 'S-Class',
      label: 'Mercedes Benz C 200 #1112 2014',
    });
    expect(q.status).toBe('CONFLICT');
    expect(qualitySummary(q)).toContain('disagrees with itself');
  });

  it('never proposes replacing the structured value', () => {
    // The conflict is a REVIEW. Nothing in it is a value to apply.
    const c = labelConflict({
      id: 'v4', make: 'Mercedes Benz', model: 'S-Class',
      label: 'Mercedes Benz C 200 #1112 2014',
    })!;
    expect(c.detail).toContain('Structured fields decide parts identity');
    expect(Object.keys(c)).not.toContain('suggestedValue');
  });

  it('does not flag a label that simply omits the model', () => {
    // "Land Rover #6889" says nothing about which model it is.
    expect(labelConflict({
      id: 'v5', make: 'Land Rover', model: 'Range Rover', label: 'Land Rover #6889',
    })).toBeNull();
  });

  it('does not flag a nickname next to a brand', () => {
    expect(labelConflict({
      id: 'v6', make: 'Porsche', model: 'Cayenne', label: 'PORSCHE CAYENNE #4994',
    })).toBeNull();
    expect(labelConflict({
      id: 'v7', make: 'Toyota', model: 'Hilux', label: 'BIG BROTHER',
    })).toBeNull();
  });

  it('ignores shop reference numbers and years', () => {
    // "#1112" and "2014" are not model designations.
    expect(labelConflict({
      id: 'v8', make: 'Toyota', model: 'Hilux', label: 'Toyota Hilux #1789 2019',
    })).toBeNull();
  });

  it('is silent when there is no label at all', () => {
    expect(labelConflict({ id: 'v9', make: 'Toyota', model: 'Hilux' })).toBeNull();
  });
});

describe('internal contradictions are only the impossible ones', () => {
  it('flags a displacement no road car has', () => {
    const q = analyzeVehicleQuality({ ...complete, displacementL: 0.2 });
    expect(q.status).toBe('CONFLICT');
    expect(q.conflicts.some(c => c.field === 'displacementL')).toBe(true);
  });

  it('flags an impossible cylinder count', () => {
    expect(analyzeVehicleQuality({ ...complete, cylinders: 30 }).status).toBe('CONFLICT');
  });

  it('leaves unusual but real vehicles alone', () => {
    // A 1.0L 3-cylinder and a 6.2L V8 are both ordinary cars.
    expect(analyzeVehicleQuality({ ...complete, displacementL: 1.0, cylinders: 3 }).status)
      .toBe('COMPLETE');
    expect(analyzeVehicleQuality({ ...complete, displacementL: 6.2, cylinders: 8 }).status)
      .toBe('COMPLETE');
  });

  it('flags an impossible year', () => {
    expect(analyzeVehicleQuality({ ...complete, year: 1782 }).status).toBe('CONFLICT');
  });
});

describe('a conflict outranks incompleteness', () => {
  it('reports CONFLICT even when fields are also missing', () => {
    // Filling in detail about possibly the wrong car is the wrong first move.
    const q = analyzeVehicleQuality({
      id: 'v10', year: 2014, make: 'Mercedes Benz', model: 'S-Class',
      label: 'Mercedes Benz C 200 #1112 2014',
    });
    expect(q.status).toBe('CONFLICT');
    expect(q.missingFields.length).toBeGreaterThan(0);
  });
});

describe('the same model written differently is not a conflict', () => {
  /**
   * Every case here was a FALSE POSITIVE against the real fleet. The first
   * version of this rule flagged 10 of 116 vehicles and only one was genuine
   * — a warning firing on nine good records buries the tenth, which is worse
   * than no warning at all.
   *
   * Found by running the analyzer over production data, not by fixtures.
   */
  it.each([
    ['spacing',            'Lexus',         'RX350',                 'LEXUS RX 350'],
    ['label is shorthand', 'Toyota',        'Land Cruiser prado',    'TOYOTA PRADO #1234'],
    ['no space in label',  'Toyota',        'Land Cruiser',          'TOYOTA LANDCRUISER LC 300'],
    ['model has a trim',   'Hyundai',       'Accent RB series',      'HYUNDAI ACCENT BLUE'],
    ['label is shorter',   'Mercedes Benz', 'CLS 350 Blue Efficiency Coupe', 'MERCEDES BENZ CLS 350'],
    ['slash aliases',      'Mitsubishi',    'Triton/L200/Strada',    'MITSUBISHI TRITON'],
    ['label adds a nickname', 'Toyota',     'Hilux vigo',            'TOYOTA HILUX MANOUN TRUCK'],
  ])('%s: %s %s', (_why, make, model, label) => {
    expect(labelConflict({ id: 'x', make, model, label })).toBeNull();
  });

  it('understands German series naming — a 750Li is a 7 Series', () => {
    // The designation is often ONE character, which the ordinary tokenizer
    // drops. That silently disabled this rule for the models it exists for.
    expect(labelConflict({ id: 'x', make: 'Bmw', model: '7 Series', label: 'BMW 750 Li' })).toBeNull();
    expect(labelConflict({ id: 'x', make: 'Bmw', model: '5 Series', label: 'BMW 530d' })).toBeNull();
    expect(labelConflict({ id: 'x', make: 'Mercedes', model: 'C-Class', label: 'MERCEDES C 200' })).toBeNull();
  });

  it('still catches the one that is real', () => {
    // "S-Class" against a label reading "C 200": no shared token, and the
    // designation letters differ. This is the case the milestone exists for.
    const c = labelConflict({
      id: 'x', make: 'Mercedes-Benz', model: 'S-Class',
      label: 'Mercedes Benz C 200 #1112 2014',
    });
    expect(c).not.toBeNull();
    expect(c!.currentValue).toBe('S-Class');
  });

  it('does not clear a genuinely different designation of the same series', () => {
    // An S-Class label saying "E 250" shares the series word but not the
    // designation letter, so it must still be reviewed.
    expect(labelConflict({
      id: 'x', make: 'Mercedes', model: 'S-Class', label: 'MERCEDES E 250',
    })).not.toBeNull();
  });
});
