/**
 * Autofill from a chosen vehicle, EXECUTED.
 *
 * The dangerous half is not what it fills — it is what it must NOT overwrite.
 * A technician who has typed a customer, or corrected a mileage, and then
 * picks the vehicle must not silently lose the correction. Nothing on screen
 * would announce that, so it is asserted here.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { vehicleAutofill, fillBlanks } from '../autofillFromVehicle';

const CUSTOMERS = [
  { id: 'c1', name: 'Vinny Auto Parts', phone: '020 5555 1234', email: 'vinny@example.com' },
  { id: 'c2', name: 'Big Brother', phone: '', email: '' },
];

const HILUX = {
  id: 'v1', label: 'Toyota Hilux Vigo #7534', vin: 'MR0FZ29G3P1234567',
  plate: '7534', make: 'Toyota', model: 'Hilux Vigo', year: '2018',
  engine: '2.8 D-4D', mileage: '128000', customerId: 'c1',
};

describe('a chosen vehicle offers everything it knows', () => {
  it('includes the owner, which is the field nobody was filling', () => {
    const a = vehicleAutofill(HILUX, CUSTOMERS);
    expect(a.customerId).toBe('c1');
    expect(a.customerName).toBe('Vinny Auto Parts');
    expect(a.customerPhone).toBe('020 5555 1234');
    expect(a.customerEmail).toBe('vinny@example.com');
  });

  it('includes the vehicle details the four screens each half-filled', () => {
    const a = vehicleAutofill(HILUX, CUSTOMERS);
    expect(a).toMatchObject({
      vin: 'MR0FZ29G3P1234567', plate: '7534', make: 'Toyota',
      model: 'Hilux Vigo', year: '2018', engine: '2.8 D-4D', mileage: '128000',
    });
  });

  it('gives blanks rather than null, so "" always means nothing to offer', () => {
    const a = vehicleAutofill({ id: 'v9' }, CUSTOMERS);
    expect(Object.values(a).every(v => typeof v === 'string')).toBe(true);
    expect(a.vin).toBe('');
    expect(a.customerName).toBe('');
  });

  it('normalises a numeric year and mileage to text the inputs use', () => {
    const a = vehicleAutofill({ year: 2018, mileage: 128000 }, CUSTOMERS);
    expect(a.year).toBe('2018');
    expect(a.mileage).toBe('128000');
  });

  it('keeps the owner id even when the customer record is not loaded', () => {
    // The link is still correct and the name can be resolved later; dropping
    // the id would silently unlink the record.
    const a = vehicleAutofill(HILUX, []);
    expect(a.customerId).toBe('c1');
    expect(a.customerName).toBe('');
  });

  it('survives a vehicle with no owner, and no vehicle at all', () => {
    expect(vehicleAutofill({ id: 'v2', make: 'Geely' }, CUSTOMERS).customerName).toBe('');
    expect(vehicleAutofill(null, CUSTOMERS).make).toBe('');
    expect(vehicleAutofill(HILUX, null).customerName).toBe('');
  });
});

describe('it never overwrites what the technician already typed', () => {
  it('leaves a customer they had already chosen', () => {
    /**
     * THE rule. Picking a vehicle to check something must not silently
     * reassign the job to the vehicle's registered owner — that is a change
     * to who gets billed, and nothing on screen would announce it.
     */
    const form = { customerName: 'Walk-in — cash', vehicle: '', vin: '' };
    const next = fillBlanks(form, vehicleAutofill(HILUX, CUSTOMERS));
    expect(next.customerName).toBe('Walk-in — cash');
    expect(next.vin).toBe('MR0FZ29G3P1234567');   // this one WAS blank
  });

  it('leaves a corrected mileage alone', () => {
    // The odometer on the sheet beats the one on file.
    const form = { mileage: '131500', engine: '' };
    const next = fillBlanks(form, vehicleAutofill(HILUX, CUSTOMERS));
    expect(next.mileage).toBe('131500');
    expect(next.engine).toBe('2.8 D-4D');
  });

  it('treats 0 as a real value, not as empty', () => {
    // A mileage of 0 on a brand-new vehicle is something someone typed.
    const form = { mileage: 0 as unknown as string };
    expect(fillBlanks(form, { mileage: '128000' }).mileage).toBe(0);
  });

  it('fills blank, null and undefined alike', () => {
    const form = { vin: '', plate: null as unknown as string, make: undefined as unknown as string };
    const next = fillBlanks(form, vehicleAutofill(HILUX, CUSTOMERS));
    expect(next).toMatchObject({ vin: 'MR0FZ29G3P1234567', plate: '7534', make: 'Toyota' });
  });
});

describe('it does not grow fields a screen does not have', () => {
  it('ignores keys the form does not already declare', () => {
    // Parts quotations have no `mileage` input. Adding one to the form object
    // would send a column nobody asked for on the next save.
    const form = { customerName: '', vehicle: '' };
    const next = fillBlanks(form, vehicleAutofill(HILUX, CUSTOMERS));
    expect(next).not.toHaveProperty('mileage');
    expect(next).not.toHaveProperty('vin');
    expect(next.customerName).toBe('Vinny Auto Parts');
  });

  it('returns the same object when nothing applies, forcing no render', () => {
    const form = { customerName: 'Already set', vehicle: 'x' };
    expect(fillBlanks(form, vehicleAutofill(HILUX, CUSTOMERS))).toBe(form);
    expect(fillBlanks(form, {})).toBe(form);
  });

  it('offers nothing from a vehicle that knows nothing', () => {
    const form = { customerName: '', vin: '' };
    expect(fillBlanks(form, vehicleAutofill({ id: 'v9' }, CUSTOMERS))).toBe(form);
  });
});

describe('the screens that pick a vehicle actually use the shared rule', () => {
  /**
   * A correct rule nothing calls is the same as no rule, and the reason this
   * exists is that four screens each solved the problem differently. So the
   * wiring is checked, not just the logic.
   */
  const read = (p: string) =>
    readFileSync(join(__dirname, '..', '..', '..', p), 'utf8');

  const WIRED = [
    ['Parts Quotations', 'features/parts/PartsEstimatesView.tsx'],
    ['Repair Orders', 'features/repair-orders/RepairOrdersView.tsx'],
    ['Inspections', 'features/inspections/InspectionsView.tsx'],
  ] as const;

  for (const [name, file] of WIRED) {
    it(`${name} fills from the chosen vehicle`, () => {
      const src = read(file);
      expect(src).toContain("from '@/lib/vehicles/autofillFromVehicle'");
      expect(src).toMatch(/fillBlanks\(/);
      expect(src).toMatch(/vehicleAutofill\(/);
    });
  }

  it('Job Cards is deliberately left alone, and stays customer-first', () => {
    /**
     * Not an oversight. Job Cards loads `customerVehicles` only after a
     * customer is chosen, so a vehicle cannot be picked before its owner is
     * already known — autofilling the customer there would be a no-op dressed
     * up as a fix.
     *
     * Asserted so that if the vehicle list ever becomes independent of the
     * customer, this fails and the decision gets revisited rather than
     * silently becoming wrong.
     */
    const src = read('features/job-cards/JobCardsView.tsx');
    expect(src).toMatch(/customerVehicles\.map\(v => \(/);
    expect(src).not.toMatch(/allVehicles\.map\(v => \(\s*<option/);
  });
});
