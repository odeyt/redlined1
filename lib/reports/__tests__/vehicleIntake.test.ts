import {
  intakeRange, inIntakeRange, carsTakenIn, summarizeIntake, groupIntake, localDay,
  csvCell, intakeCsvRows, type IntakeVisit,
} from '../vehicleIntake';

// Built from the LOCAL calendar so these tests pass in any time zone.
const at = (y: number, m: number, d: number, h = 10, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

const visit = (over: Partial<IntakeVisit> & { checkIn: string }): IntakeVisit => ({
  id: 'JC-1', label: 'Camry', customerName: 'AI JOY', status: 'In Progress', source: 'open', ...over,
});

describe('intakeRange', () => {
  it('spans one local calendar month, end exclusive', () => {
    const r = intakeRange(9, 2026);
    expect(r.startIso).toBe(at(2026, 9, 1, 0));
    expect(r.endIso).toBe(at(2026, 10, 1, 0));
  });

  it('rolls December into January of the next year', () => {
    const r = intakeRange(12, 2026);
    expect(r.endIso).toBe(at(2027, 1, 1, 0));
  });

  it('treats month 0 as the whole year', () => {
    const r = intakeRange(0, 2026);
    expect(r.startIso).toBe(at(2026, 1, 1, 0));
    expect(r.endIso).toBe(at(2027, 1, 1, 0));
  });
});

describe('inIntakeRange', () => {
  const range = intakeRange(9, 2026);
  const visits = [
    visit({ id: 'a', checkIn: at(2026, 8, 31, 23, 59) }),
    visit({ id: 'b', checkIn: at(2026, 9, 1, 0, 0) }),
    visit({ id: 'c', checkIn: at(2026, 9, 30, 23, 59) }),
    visit({ id: 'd', checkIn: at(2026, 10, 1, 0, 0) }),
    visit({ id: 'e', checkIn: 'not a date' }),
  ];

  it('keeps the first and last minute of the month and drops the neighbours and bad dates', () => {
    expect(inIntakeRange(visits, range).map(v => v.id)).toEqual(['b', 'c']);
  });
});

describe('carsTakenIn', () => {
  it('counts the same car on two different days as two arrivals', () => {
    const cars = carsTakenIn([
      visit({ id: 'J1', checkIn: at(2026, 9, 3) }),
      visit({ id: 'J2', checkIn: at(2026, 9, 20) }),
    ]);
    expect(cars).toHaveLength(2);
  });

  it('counts two job cards for the same car on the same day as one arrival', () => {
    const cars = carsTakenIn([
      visit({ id: 'J1', checkIn: at(2026, 9, 3, 9) }),
      visit({ id: 'J2', checkIn: at(2026, 9, 3, 15) }),
    ]);
    expect(cars).toHaveLength(1);
    expect(cars[0].jobCount).toBe(2);
    expect(cars[0].id).toBe('J1'); // earliest of the day
  });

  it('treats name case and spacing as the same car', () => {
    const cars = carsTakenIn([
      visit({ id: 'J1', label: 'Camry  White', checkIn: at(2026, 9, 3, 9) }),
      visit({ id: 'J2', label: 'camry white', checkIn: at(2026, 9, 3, 10) }),
    ]);
    expect(cars).toHaveLength(1);
  });

  it('keeps different cars of the same customer apart', () => {
    const cars = carsTakenIn([
      visit({ id: 'J1', label: 'Camry', checkIn: at(2026, 9, 3) }),
      visit({ id: 'J2', label: 'Hilux', checkIn: at(2026, 9, 3) }),
    ]);
    expect(cars).toHaveLength(2);
  });

  it('returns newest first and does not mutate its input', () => {
    const input = [
      visit({ id: 'old', label: 'A', checkIn: at(2026, 9, 1) }),
      visit({ id: 'new', label: 'B', checkIn: at(2026, 9, 9) }),
    ];
    const copy = input.map(v => ({ ...v }));
    expect(carsTakenIn(input).map(c => c.id)).toEqual(['new', 'old']);
    expect(input).toEqual(copy);
  });

  it('includes visits that have already been closed', () => {
    const cars = carsTakenIn([visit({ id: 'JC-9', source: 'closed', status: 'Closed', checkIn: at(2026, 9, 5) })]);
    expect(cars).toHaveLength(1);
    expect(cars[0].source).toBe('closed');
  });
});

describe('summarizeIntake', () => {
  it('separates arrivals from different cars, customers and job cards', () => {
    const cars = carsTakenIn([
      visit({ id: 'J1', label: 'Camry', customerName: 'AI JOY', checkIn: at(2026, 9, 3, 9) }),
      visit({ id: 'J2', label: 'Camry', customerName: 'AI JOY', checkIn: at(2026, 9, 3, 11) }),
      visit({ id: 'J3', label: 'Camry', customerName: 'AI JOY', checkIn: at(2026, 9, 20) }),
      visit({ id: 'J4', label: 'Hilux', customerName: 'BIG BROTHER', checkIn: at(2026, 9, 21) }),
    ]);
    expect(summarizeIntake(cars)).toEqual({ arrivals: 3, differentCars: 2, customers: 2, jobCards: 4 });
  });

  it('is all zeros for no cars', () => {
    expect(summarizeIntake([])).toEqual({ arrivals: 0, differentCars: 0, customers: 0, jobCards: 0 });
  });
});

describe('groupIntake', () => {
  const cars = carsTakenIn([
    visit({ id: 'J1', label: 'A', checkIn: at(2026, 9, 3) }),
    visit({ id: 'J2', label: 'B', checkIn: at(2026, 9, 3) }),
    visit({ id: 'J3', label: 'C', checkIn: at(2026, 9, 17) }),
    visit({ id: 'J4', label: 'D', checkIn: at(2026, 1, 2) }),
  ]);

  it('groups by day of month', () => {
    expect(groupIntake(cars.filter(c => localDay(c.checkIn).startsWith('2026-09')), 9)).toEqual([
      { key: '03', label: '3', count: 2 },
      { key: '17', label: '17', count: 1 },
    ]);
  });

  it('groups by month for a whole year', () => {
    expect(groupIntake(cars, 0)).toEqual([
      { key: '01', label: 'Jan', count: 1 },
      { key: '09', label: 'Sep', count: 3 },
    ]);
  });

  it('returns nothing for no cars', () => {
    expect(groupIntake([], 9)).toEqual([]);
  });
});

describe('csv', () => {
  it('doubles quotes so a label cannot break out of its cell', () => {
    expect(csvCell('5" lift kit')).toBe('5"" lift kit');
  });

  it('defuses a leading formula character', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
  });

  it('writes a header and one row per car', () => {
    const out = intakeCsvRows(carsTakenIn([visit({ id: 'JC-7', checkIn: at(2026, 9, 3) })]));
    expect(out[0]).toEqual(['Checked In', 'Vehicle', 'Customer', 'Job Card', 'Status', 'Job Cards That Day']);
    expect(out[1]).toEqual(['2026-09-03', 'Camry', 'AI JOY', 'JC-7', 'In Progress', '1']);
  });
});
