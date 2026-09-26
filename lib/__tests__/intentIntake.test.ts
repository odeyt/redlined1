/**
 * The intent-intake rules, with no database: which choices exist, what counts
 * as a vehicle's active repair order, what each form requires, and how a
 * parts inquiry is written down.
 */
import {
  INTAKE_CHOICES, activeOrdersForVehicle, buildPartsInquiryNotes, isActiveRepairOrderStatus,
  matchCustomerByName, validatePartsInquiry, validateServiceIntake,
  type PartsInquiryFields, type ServiceIntakeFields,
} from '@/lib/intake/intentIntake';

describe('the choices', () => {
  it('offers exactly the four intents, service-now first', () => {
    expect(INTAKE_CHOICES.map(c => c.intent)).toEqual(['service_now', 'service_later', 'parts', 'record_only']);
    expect(INTAKE_CHOICES.map(c => c.label)).toEqual([
      'Vehicle here for service', 'Book service for later', 'Parts inquiry or order', 'Customer record only',
    ]);
  });
});

describe('active repair orders for a vehicle', () => {
  const orders = [
    { id: '1', vehicle: '2019 Ford F-150', status: 'In Progress' },
    { id: '2', vehicle: '2019  ford f-150 ', status: 'Pending Parts' },
    { id: '3', vehicle: '2019 Ford F-150', status: 'Closed' },
    { id: '4', vehicle: '2019 Ford F-150', status: 'Complete' },
    { id: '5', vehicle: '2019 Ford F-150', status: 'Void' },
    { id: '6', vehicle: '2021 Honda CR-V', status: 'Open' },
  ];

  it('matches the label regardless of case and spacing, and only active statuses', () => {
    expect(activeOrdersForVehicle(orders, '2019 Ford F-150').map(o => o.id)).toEqual(['1', '2']);
  });

  it('never matches another vehicle of the same customer', () => {
    expect(activeOrdersForVehicle(orders, '2021 Honda CR-V').map(o => o.id)).toEqual(['6']);
  });

  it('matches nothing for an empty label', () => {
    expect(activeOrdersForVehicle(orders, '  ')).toEqual([]);
  });

  it('treats Complete, Closed and Void as finished and everything else as active', () => {
    for (const s of ['Complete', 'Closed', 'Void']) expect(isActiveRepairOrderStatus(s)).toBe(false);
    for (const s of ['Open', 'In Progress', 'Pending Parts', 'Pending Approval']) expect(isActiveRepairOrderStatus(s)).toBe(true);
  });
});

describe('service intake validation', () => {
  const now = new Date('2026-09-26T09:00:00');
  const ok: ServiceIntakeFields = {
    customerId: 'c1', vehicleId: 'v1', vehicleLabel: '2019 Ford F-150',
    concern: 'A/C not cold', location: 'Bay 1', arrivedAt: '2026-09-26T08:45', technician: '',
  };

  it('accepts a complete intake with no technician', () => {
    expect(validateServiceIntake(ok, now)).toEqual({});
  });

  it('requires customer, vehicle, concern, location and arrival', () => {
    const e = validateServiceIntake({ ...ok, customerId: '', vehicleId: '', vehicleLabel: '', concern: ' ', location: '', arrivedAt: '' }, now);
    expect(Object.keys(e).sort()).toEqual(['arrivedAt', 'concern', 'customer', 'location', 'vehicle']);
  });

  it('refuses an arrival in the future and points to booking instead', () => {
    const e = validateServiceIntake({ ...ok, arrivedAt: '2026-09-27T09:00' }, now);
    expect(e.arrivedAt).toMatch(/book service/i);
  });
});

describe('parts inquiry', () => {
  const base: PartsInquiryFields = {
    customerId: 'c1', customerName: 'Pat Owner', vehicleLabel: '',
    partRequested: 'Front brake pads', partNumber: '', quantity: '2', fitment: '',
    contactPhone: '555-0100', contactEmail: '', referral: false, referredBy: '',
  };

  it('is valid with no vehicle at all', () => {
    expect(validatePartsInquiry(base)).toEqual({});
  });

  it('needs the part and a way to reach the customer', () => {
    const e = validatePartsInquiry({ ...base, partRequested: '', contactPhone: '', contactEmail: '' });
    expect(e.partRequested).toBeDefined();
    expect(e.contact).toBeDefined();
  });

  it('needs the referrer when it is a referral', () => {
    expect(validatePartsInquiry({ ...base, referral: true }).referredBy).toBeDefined();
    expect(validatePartsInquiry({ ...base, referral: true, referredBy: 'Sam at Joe\'s Garage' })).toEqual({});
  });

  it('writes part, fitment, contact and referral into the notes, and says the vehicle is not here', () => {
    const notes = buildPartsInquiryNotes({ ...base, partNumber: 'BP-123', fitment: '2.0L, front axle', referral: true, referredBy: 'Sam' });
    expect(notes).toContain('Part requested: Front brake pads');
    expect(notes).toContain('Part number: BP-123');
    expect(notes).toContain('Fitment: 2.0L, front axle');
    expect(notes).toContain('Vehicle: not given — not at the shop');
    expect(notes).toContain('Contact: 555-0100');
    expect(notes).toContain('Referral: yes — Sam');
  });
});

describe('matching an appointment to its customer', () => {
  const customers = [
    { id: 'a', name: 'John Smith' },
    { id: 'b', name: 'john smith' },
    { id: 'c', name: 'Pat Owner' },
  ];

  it('resolves exactly one match, ignoring case', () => {
    expect(matchCustomerByName(customers, ' pat owner ')?.id).toBe('c');
  });

  it('refuses to guess between two customers with the same name', () => {
    expect(matchCustomerByName(customers, 'John Smith')).toBeNull();
  });
});
