import { intakeRange, inIntakeRange, groupIntake, csvCell, intakeCsvRows } from '../vehicleIntake';

describe('intakeRange', () => {
  it('covers one calendar month, end exclusive', () => {
    expect(intakeRange(9, 2026)).toEqual({ start: '2026-09-01', end: '2026-10-01' });
    expect(intakeRange(2, 2026)).toEqual({ start: '2026-02-01', end: '2026-03-01' });
  });

  it('rolls December into January of the next year', () => {
    expect(intakeRange(12, 2026)).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });

  it('treats month 0 as the whole year', () => {
    expect(intakeRange(0, 2026)).toEqual({ start: '2026-01-01', end: '2027-01-01' });
  });
});

describe('inIntakeRange', () => {
  const rows = [
    { id: 'a', dateReceived: '2026-08-31' },
    { id: 'b', dateReceived: '2026-09-01' },
    { id: 'c', dateReceived: '2026-09-30' },
    { id: 'd', dateReceived: '2026-10-01' },
    { id: 'e', dateReceived: null },
    { id: 'f', dateReceived: '2026-09-15T08:00:00Z' },
  ];

  it('includes the first and last day, excludes the neighbours and undated rows', () => {
    const ids = inIntakeRange(rows, intakeRange(9, 2026)).map(r => r.id);
    expect(ids.sort()).toEqual(['b', 'c', 'f']);
  });

  it('returns newest first', () => {
    const ids = inIntakeRange(rows, intakeRange(9, 2026)).map(r => r.id);
    expect(ids).toEqual(['c', 'f', 'b']);
  });

  it('does not mutate the input', () => {
    const copy = rows.map(r => ({ ...r }));
    inIntakeRange(rows, intakeRange(9, 2026));
    expect(rows).toEqual(copy);
  });
});

describe('groupIntake', () => {
  const rows = [
    { dateReceived: '2026-09-03' },
    { dateReceived: '2026-09-03' },
    { dateReceived: '2026-09-17' },
  ];

  it('groups by day of month for a single month', () => {
    expect(groupIntake(rows, 9)).toEqual([
      { key: '03', label: '3', count: 2 },
      { key: '17', label: '17', count: 1 },
    ]);
  });

  it('groups by month for a whole year', () => {
    expect(groupIntake([...rows, { dateReceived: '2026-01-02' }], 0)).toEqual([
      { key: '01', label: 'Jan', count: 1 },
      { key: '09', label: 'Sep', count: 3 },
    ]);
  });

  it('returns nothing for no rows', () => {
    expect(groupIntake([], 9)).toEqual([]);
  });
});

describe('csv', () => {
  it('doubles quotes so a label cannot break out of its cell', () => {
    expect(csvCell('5" lift kit')).toBe('5"" lift kit');
  });

  it('defuses a leading formula character', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-1')).toBe("'-1");
  });

  it('writes a header and one row per vehicle', () => {
    const out = intakeCsvRows([
      { id: '1', label: 'Camry', plate: '1234', status: 'Pending', dateReceived: '2026-09-03', customerName: 'AI JOY' },
    ]);
    expect(out[0]).toEqual(['Date Received', 'Vehicle', 'Customer', 'Plate', 'Status']);
    expect(out[1]).toEqual(['2026-09-03', 'Camry', 'AI JOY', '1234', 'Pending']);
  });
});
