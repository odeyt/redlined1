import { vehicleListCsv, csvCell, type VehicleCsvRow } from '../vehicleListCsv';

const row = (over: Partial<VehicleCsvRow> = {}): VehicleCsvRow => ({
  label: 'BMW X6', customer: 'AI BOUNMI', yearMakeModel: '2012 BMW X6', plate: '#8989',
  status: 'Completed', assignedTech: 'BECK', received: '2026-09-03', completed: '2026-09-03', ...over,
});

describe('csvCell', () => {
  it('doubles quotes', () => expect(csvCell('5" lift')).toBe('5"" lift'));
  it('defuses a leading formula character', () => expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)"));
});

describe('vehicleListCsv', () => {
  it('writes a header and one row per vehicle, with no VIN column', () => {
    const out = vehicleListCsv([row()], false);
    expect(out[0]).toEqual(['Vehicle', 'Customer', 'Year Make Model', 'Plate', 'Status', 'Assigned Tech', 'Received']);
    expect(out[0].join(',')).not.toMatch(/vin/i);
    expect(out[1]).toEqual(['BMW X6', 'AI BOUNMI', '2012 BMW X6', '#8989', 'Completed', 'BECK', '2026-09-03']);
  });

  it('adds a Completed column only when asked', () => {
    const out = vehicleListCsv([row()], true);
    expect(out[0].at(-1)).toBe('Completed');
    expect(out[1].at(-1)).toBe('2026-09-03');
  });

  it('keeps a hostile vehicle name inert', () => {
    expect(vehicleListCsv([row({ label: '=HYPERLINK("x")' })], false)[1][0]).toBe("'=HYPERLINK(\"\"x\"\")");
  });

  it('is just a header for no vehicles', () => {
    expect(vehicleListCsv([], false)).toHaveLength(1);
  });
});
