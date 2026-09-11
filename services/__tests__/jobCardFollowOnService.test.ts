/**
 * Every job card gets a repair order and a parts quotation.
 *
 * The rule these tests hold: neither follow-on may take the job card down
 * with it. Before this existed a job card was the only record intake
 * produced, and staff searching for a vehicle's repair order found nothing —
 * so the failure mode that matters most is a partial one, where the RO
 * cannot be raised but the quotation still should be, and the caller is told
 * which half is missing rather than being handed a thrown error.
 */
const mockNextRONumber = jest.fn();
const mockCreateRepairOrder = jest.fn();
const mockCreatePartsEstimate = jest.fn();
const mockFindRO = jest.fn();
const mockFindQuote = jest.fn();

jest.mock('../repairOrderService', () => ({
  nextRONumber: (...a: unknown[]) => mockNextRONumber(...a),
  createRepairOrder: (...a: unknown[]) => mockCreateRepairOrder(...a),
  findRepairOrderByJobCard: (...a: unknown[]) => mockFindRO(...a),
}));
jest.mock('../partsEstimateService', () => ({
  createPartsEstimate: (...a: unknown[]) => mockCreatePartsEstimate(...a),
  findPartsEstimateByJobCard: (...a: unknown[]) => mockFindQuote(...a),
}));

import { createJobCardFollowOns } from '../jobCardFollowOnService';

const INPUT = {
  jobCardId: 'JC-00042',
  customerName: 'BIG BROTHER',
  customerId: 'cust-1',
  vehicle: '2019 BMW 320i # 2222',
  serviceType: 'Engine — Starter',
  notes: 'Will not start',
};

beforeEach(() => {
  mockNextRONumber.mockReset().mockResolvedValue('RO-00072');
  mockCreateRepairOrder.mockReset().mockResolvedValue({ id: 'ro-1' });
  mockCreatePartsEstimate.mockReset().mockResolvedValue({ id: 'pe-1' });
  mockFindRO.mockReset().mockResolvedValue(null);
  mockFindQuote.mockReset().mockResolvedValue(null);
});

describe('createJobCardFollowOns', () => {
  it('links both records back to the job card', async () => {
    const result = await createJobCardFollowOns(INPUT);

    expect(result).toEqual({
      roNumber: 'RO-00072', quotationCreated: true,
      roReused: false, quotationReused: false, errors: [],
    });
    expect(mockCreateRepairOrder).toHaveBeenCalledWith(
      expect.objectContaining({ jobCardId: 'JC-00042', roNumber: 'RO-00072', status: 'Open' }),
    );
    expect(mockCreatePartsEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ jobCardNumber: 'JC-00042', status: 'Draft' }),
    );
  });

  it('carries customerId onto the repair order', async () => {
    // Vehicle Intake's history panel reads repair_orders by customer_id. An
    // RO saved without it exists but is invisible there, which is the exact
    // "no repair order for this vehicle" symptom this feature exists to fix.
    await createJobCardFollowOns(INPUT);
    expect(mockCreateRepairOrder).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-1', customerName: 'BIG BROTHER' }),
    );
  });

  it('seeds the repair order concern from the service type', async () => {
    await createJobCardFollowOns(INPUT);
    expect(mockCreateRepairOrder).toHaveBeenCalledWith(
      expect.objectContaining({ concern: 'Engine — Starter' }),
    );
  });

  it('falls back to the notes when there is no service type', async () => {
    await createJobCardFollowOns({ ...INPUT, serviceType: '' });
    expect(mockCreateRepairOrder).toHaveBeenCalledWith(
      expect.objectContaining({ concern: 'Will not start' }),
    );
  });

  it('puts the new RO number on the quotation so the three records form one chain', async () => {
    await createJobCardFollowOns(INPUT);
    expect(mockCreatePartsEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ repairOrderNumber: 'RO-00072' }),
    );
  });

  it('still creates the quotation when the repair order fails, and reports which failed', async () => {
    mockCreateRepairOrder.mockRejectedValue(new Error('RLS denied'));

    const result = await createJobCardFollowOns(INPUT);

    expect(result.roNumber).toBeNull();
    expect(result.quotationCreated).toBe(true);
    expect(result.errors).toEqual(['Repair order: RLS denied']);
    // No RO number to reference, but the quotation is still worth having.
    expect(mockCreatePartsEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ repairOrderNumber: '' }),
    );
  });

  it('reports a failed quotation without discarding the repair order it did create', async () => {
    mockCreatePartsEstimate.mockRejectedValue(new Error('insert failed'));

    const result = await createJobCardFollowOns(INPUT);

    expect(result.roNumber).toBe('RO-00072');
    expect(result.quotationCreated).toBe(false);
    expect(result.errors).toEqual(['Parts quotation: insert failed']);
  });

  it('never throws, so a job card is never lost to a follow-on failure', async () => {
    mockNextRONumber.mockRejectedValue(new Error('numbering down'));
    mockCreatePartsEstimate.mockRejectedValue(new Error('insert failed'));

    const result = await createJobCardFollowOns(INPUT);

    expect(result).toEqual({
      roNumber: null,
      quotationCreated: false,
      roReused: false,
      quotationReused: false,
      errors: ['Repair order: numbering down', 'Parts quotation: insert failed'],
    });
  });
});

describe('asked twice for the same job card', () => {
  it('reuses the repair order that is already there', async () => {
    mockFindRO.mockResolvedValue({ roNumber: 'RO-00072', id: 'ro-1' });

    const result = await createJobCardFollowOns(INPUT);

    expect(mockCreateRepairOrder).not.toHaveBeenCalled();
    expect(mockNextRONumber).not.toHaveBeenCalled();
    expect(result.roNumber).toBe('RO-00072');
    expect(result.roReused).toBe(true);
  });

  it('reuses the quotation that is already there', async () => {
    mockFindQuote.mockResolvedValue({ id: 'pe-1' });

    const result = await createJobCardFollowOns(INPUT);

    expect(mockCreatePartsEstimate).not.toHaveBeenCalled();
    expect(result.quotationCreated).toBe(true);
    expect(result.quotationReused).toBe(true);
  });

  it('creates nothing at all the second time round', async () => {
    mockFindRO.mockResolvedValue({ roNumber: 'RO-00072' });
    mockFindQuote.mockResolvedValue({ id: 'pe-1' });

    const result = await createJobCardFollowOns(INPUT);

    expect(mockCreateRepairOrder).not.toHaveBeenCalled();
    expect(mockCreatePartsEstimate).not.toHaveBeenCalled();
    expect(result).toEqual({
      roNumber: 'RO-00072', quotationCreated: true,
      roReused: true, quotationReused: true, errors: [],
    });
  });

  it('looks both records up by the job card id, which is what links them', async () => {
    await createJobCardFollowOns(INPUT);
    expect(mockFindRO).toHaveBeenCalledWith('JC-00042');
    expect(mockFindQuote).toHaveBeenCalledWith('JC-00042');
  });
});

describe('what the technician found', () => {
  it('opens both records stating it, so neither arrives blank', async () => {
    await createJobCardFollowOns({ ...INPUT, findings: 'Failed (1):\n• Brakes — Front pads: 2mm' });

    expect(mockCreateRepairOrder).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringContaining('Front pads') }),
    );
    expect(mockCreatePartsEstimate).toHaveBeenCalledWith(
      expect.objectContaining({ notes: expect.stringContaining('Front pads') }),
    );
  });

  it('still opens the quotation with no prices on it', async () => {
    await createJobCardFollowOns({ ...INPUT, findings: 'Failed (1):\n• Brakes — Front pads' });

    expect(mockCreatePartsEstimate).toHaveBeenCalledWith(expect.objectContaining({
      status: 'Draft', lineItems: [], totalCost: 0, unitCost: 0, quantity: 0, deposit: 0,
    }));
  });
});
