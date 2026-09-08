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

jest.mock('../repairOrderService', () => ({
  nextRONumber: (...a: unknown[]) => mockNextRONumber(...a),
  createRepairOrder: (...a: unknown[]) => mockCreateRepairOrder(...a),
}));
jest.mock('../partsEstimateService', () => ({
  createPartsEstimate: (...a: unknown[]) => mockCreatePartsEstimate(...a),
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
});

describe('createJobCardFollowOns', () => {
  it('links both records back to the job card', async () => {
    const result = await createJobCardFollowOns(INPUT);

    expect(result).toEqual({ roNumber: 'RO-00072', quotationCreated: true, errors: [] });
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
      errors: ['Repair order: numbering down', 'Parts quotation: insert failed'],
    });
  });
});
