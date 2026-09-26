/**
 * Intent intake, through the real orchestration with the record services
 * mocked. What these hold:
 *
 *   - "Vehicle here for service" makes ONE job card, and the repair order
 *     through the existing follow-on path, linked to the right customer and
 *     vehicle; the technician is carried when chosen and flagged when not.
 *   - It never makes a second visit: not on a double tap, not on a retry,
 *     not when another tab won the race, and not silently when the vehicle
 *     already has an active repair order.
 *   - A failure after the job card is saved is a warning, not a lost visit.
 *   - A parts inquiry makes a draft quotation and nothing else — no job card,
 *     no repair order, no vehicle status change — with or without a vehicle.
 */

const mockFetchJobCardById = jest.fn();
const mockCreateJobCard = jest.fn();
const mockFollowOns = jest.fn();
const mockActiveROs = jest.fn();
const mockCreateEstimate = jest.fn();
const mockFetchEstimate = jest.fn();
const mockSetVehicleStatus = jest.fn();
const mockUpdateAppointment = jest.fn();
const mockCreateRepairOrder = jest.fn();

jest.mock('../jobCardService', () => ({
  fetchJobCardById: (...a: unknown[]) => mockFetchJobCardById(...a),
  createJobCard: (...a: unknown[]) => mockCreateJobCard(...a),
}));
jest.mock('../jobCardFollowOnService', () => ({
  createJobCardFollowOns: (...a: unknown[]) => mockFollowOns(...a),
}));
jest.mock('../repairOrderService', () => ({
  fetchActiveRepairOrdersForCustomer: (...a: unknown[]) => mockActiveROs(...a),
  // Never called by the intake: repair orders only come from the follow-ons.
  createRepairOrder: (...a: unknown[]) => mockCreateRepairOrder(...a),
}));
jest.mock('../partsEstimateService', () => ({
  createPartsEstimate: (...a: unknown[]) => mockCreateEstimate(...a),
  fetchPartsEstimateById: (...a: unknown[]) => mockFetchEstimate(...a),
}));
jest.mock('../vehicleService', () => ({
  setVehicleStatus: (...a: unknown[]) => mockSetVehicleStatus(...a),
}));
jest.mock('../appointmentService', () => ({
  updateAppointment: (...a: unknown[]) => mockUpdateAppointment(...a),
}));

import { startServiceVisit, createPartsInquiry, type ServiceVisitInput } from '../intakeService';

let seq = 0;
function visit(overrides: Partial<ServiceVisitInput> = {}): ServiceVisitInput {
  seq++;
  return {
    requestId: `JC-TEST-${seq}`,
    customerId: 'cust-1',
    customerName: 'Pat Owner',
    vehicleId: 'veh-1',
    vehicleLabel: '2019 Ford F-150',
    concern: 'A/C not cold',
    location: 'Bay 1',
    arrivedAt: '2026-09-26T01:45:00.000Z',
    technician: '',
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchJobCardById.mockReset().mockResolvedValue(null);
  mockCreateJobCard.mockReset().mockImplementation(async (f: { id: string }) => ({ id: f.id }));
  mockFollowOns.mockReset().mockResolvedValue({ roNumber: 'RO-00100', quotationCreated: true, roReused: false, quotationReused: false, errors: [] });
  mockActiveROs.mockReset().mockResolvedValue([]);
  mockCreateEstimate.mockReset().mockImplementation(async (_o: unknown, opts: { id: string }) => ({ id: opts.id }));
  mockFetchEstimate.mockReset().mockResolvedValue(null);
  mockSetVehicleStatus.mockReset().mockResolvedValue(undefined);
  mockUpdateAppointment.mockReset().mockResolvedValue(undefined);
  mockCreateRepairOrder.mockReset();
});

describe('vehicle here for service', () => {
  it('creates one job card and the repair order through the follow-on path, linked to customer and vehicle', async () => {
    const input = visit();
    const result = await startServiceVisit(input);

    expect(result).toEqual({
      kind: 'created', jobCardId: input.requestId, roNumber: 'RO-00100',
      reused: false, needsTechnician: true, warnings: [],
    });
    expect(mockCreateJobCard).toHaveBeenCalledTimes(1);
    expect(mockCreateJobCard).toHaveBeenCalledWith(expect.objectContaining({
      id: input.requestId,
      customer: 'Pat Owner',
      vehicle: '2019 Ford F-150',
      serviceType: 'A/C not cold',
      location: 'Bay 1',
      technicians: [],
      checkInDate: '2026-09-26T01:45:00.000Z',
    }));
    expect(mockFollowOns).toHaveBeenCalledWith(expect.objectContaining({
      jobCardId: input.requestId,
      customerId: 'cust-1',
      customerName: 'Pat Owner',
      vehicle: '2019 Ford F-150',
    }));
    // The repair order is never inserted directly — only via the follow-ons.
    expect(mockCreateRepairOrder).not.toHaveBeenCalled();
    // The vehicle is marked as at the shop.
    expect(mockSetVehicleStatus).toHaveBeenCalledWith('veh-1', 'In Progress');
  });

  it('carries a chosen technician onto the job card and repair order', async () => {
    const result = await startServiceVisit(visit({ technician: 'Mike R.' }));

    expect(mockCreateJobCard).toHaveBeenCalledWith(expect.objectContaining({ technicians: ['Mike R.'] }));
    expect(mockFollowOns).toHaveBeenCalledWith(expect.objectContaining({ technician: 'Mike R.' }));
    expect(result).toMatchObject({ kind: 'created', needsTechnician: false });
  });

  it('links the appointment being checked in to the new job card', async () => {
    const appointment = {
      id: 'appt-1', date: '2026-09-26',
      data: ['09:00', 'Pat Owner', '2019 Ford F-150', 'A/C', '', 'Bay 1', 'Confirmed', ''] as [string, string, string, string, string, string, string, string],
    };
    const input = visit({ appointment });
    await startServiceVisit(input);

    const [id, date, data] = mockUpdateAppointment.mock.calls[0];
    expect(id).toBe('appt-1');
    expect(date).toBe('2026-09-26');
    expect(data[4]).toBe(input.requestId);
    expect(data[6]).toBe('Checked in');
  });
});

describe('duplicate prevention', () => {
  it('a double tap shares one run and creates one job card', async () => {
    const input = visit();
    const [a, b] = await Promise.all([startServiceVisit(input), startServiceVisit(input)]);

    expect(a).toEqual(b);
    expect(mockCreateJobCard).toHaveBeenCalledTimes(1);
    expect(mockFollowOns).toHaveBeenCalledTimes(1);
  });

  it('a retry of the same submission reuses the job card and never creates another', async () => {
    const input = visit();
    mockFetchJobCardById.mockResolvedValue({ id: input.requestId });

    const result = await startServiceVisit(input);

    expect(mockCreateJobCard).not.toHaveBeenCalled();
    // Skips the active-order check: it would only find this intake's own order.
    expect(mockActiveROs).not.toHaveBeenCalled();
    expect(mockFollowOns).toHaveBeenCalledWith(expect.objectContaining({ jobCardId: input.requestId }));
    expect(result).toMatchObject({ kind: 'created', reused: true });
  });

  it('when another tab won the race for the id, uses its job card instead of failing', async () => {
    const input = visit();
    mockFetchJobCardById.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: input.requestId });
    mockCreateJobCard.mockRejectedValue({ code: '23505', message: 'duplicate key' });

    const result = await startServiceVisit(input);

    expect(result).toMatchObject({ kind: 'created', jobCardId: input.requestId });
    expect(mockFollowOns).toHaveBeenCalledTimes(1);
  });

  it('stops at an active repair order for the same vehicle, creating nothing', async () => {
    mockActiveROs.mockResolvedValue([
      { id: 'ro-9', roNumber: 'RO-00011', vehicle: '2019 ford f-150', status: 'In Progress' },
      { id: 'ro-8', roNumber: 'RO-00010', vehicle: '2021 Honda CR-V', status: 'Open' },
    ]);

    const result = await startServiceVisit(visit());

    expect(result.kind).toBe('active_order_exists');
    if (result.kind === 'active_order_exists') expect(result.orders.map(o => o.roNumber)).toEqual(['RO-00011']);
    expect(mockCreateJobCard).not.toHaveBeenCalled();
    expect(mockFollowOns).not.toHaveBeenCalled();
    expect(mockSetVehicleStatus).not.toHaveBeenCalled();
  });

  it('creates a separate visit only when staff choose it deliberately', async () => {
    mockActiveROs.mockResolvedValue([{ id: 'ro-9', roNumber: 'RO-00011', vehicle: '2019 Ford F-150', status: 'In Progress' }]);

    const result = await startServiceVisit(visit({ allowSeparateVisit: true }));

    expect(result.kind).toBe('created');
    expect(mockCreateJobCard).toHaveBeenCalledTimes(1);
  });
});

describe('partial failure', () => {
  it('keeps the visit when the repair order could not be raised, and says so', async () => {
    mockFollowOns.mockResolvedValue({ roNumber: null, quotationCreated: true, roReused: false, quotationReused: false, errors: ['Repair order: network down'] });

    const result = await startServiceVisit(visit());

    expect(result).toMatchObject({ kind: 'created', roNumber: null, warnings: ['Repair order: network down'] });
  });

  it('reports a vehicle-status failure as a warning, not a failed intake', async () => {
    mockSetVehicleStatus.mockRejectedValue(new Error('permission denied'));

    const result = await startServiceVisit(visit());

    expect(result.kind).toBe('created');
    if (result.kind === 'created') expect(result.warnings[0]).toMatch(/Vehicle status: permission denied/);
  });

  it('throws — so nothing is claimed — when the job card itself cannot be saved', async () => {
    mockCreateJobCard.mockRejectedValue(new Error('offline'));

    await expect(startServiceVisit(visit())).rejects.toThrow('offline');
    expect(mockFollowOns).not.toHaveBeenCalled();
  });
});

describe('parts inquiry', () => {
  const inquiry = (overrides = {}) => ({
    requestId: `pe-${++seq}`,
    currency: 'USD',
    customerId: 'cust-1', customerName: 'Pat Owner', vehicleLabel: '',
    partRequested: 'Front brake pads', partNumber: 'BP-1', quantity: '2', fitment: '2.0L',
    contactPhone: '555-0100', contactEmail: '', referral: true, referredBy: 'Sam',
    ...overrides,
  });

  it('with no vehicle on site: a draft quotation, and no job card, repair order or vehicle status change', async () => {
    const input = inquiry();
    const result = await createPartsInquiry(input);

    expect(result).toEqual({ estimate: { id: input.requestId }, reused: false });
    const [payload, opts] = mockCreateEstimate.mock.calls[0];
    expect(opts).toEqual({ id: input.requestId });
    expect(payload).toMatchObject({
      status: 'Draft', partName: 'Front brake pads', partNumber: 'BP-1', quantity: 2,
      vehicle: '', customerName: 'Pat Owner', jobCardNumber: '', repairOrderNumber: '',
      unitCost: 0, totalCost: 0, currency: 'USD',
    });
    expect(payload.notes).toContain('Referral: yes — Sam');
    expect(payload.notes).toContain('not at the shop');
    expect(mockCreateJobCard).not.toHaveBeenCalled();
    expect(mockFollowOns).not.toHaveBeenCalled();
    expect(mockCreateRepairOrder).not.toHaveBeenCalled();
    expect(mockSetVehicleStatus).not.toHaveBeenCalled();
  });

  it('records a vehicle when one is given, still without marking it at the shop', async () => {
    await createPartsInquiry(inquiry({ vehicleLabel: '2019 Ford F-150' }));
    expect(mockCreateEstimate.mock.calls[0][0].vehicle).toBe('2019 Ford F-150');
    expect(mockSetVehicleStatus).not.toHaveBeenCalled();
  });

  it('a retry finds the quotation already filed instead of adding a second', async () => {
    const input = inquiry();
    mockFetchEstimate.mockResolvedValue({ id: input.requestId });

    const result = await createPartsInquiry(input);

    expect(result.reused).toBe(true);
    expect(mockCreateEstimate).not.toHaveBeenCalled();
  });

  it('a collision on the id resolves to the existing quotation', async () => {
    const input = inquiry();
    mockFetchEstimate.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: input.requestId });
    mockCreateEstimate.mockRejectedValue({ code: '23505' });

    const result = await createPartsInquiry(input);

    expect(result).toEqual({ estimate: { id: input.requestId }, reused: true });
  });
});
