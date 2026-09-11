/**
 * Completing an inspection is what starts the job.
 *
 * The rule these tests hold: one press or five, the shop ends up with one job
 * card, one repair order and one parts quotation — and an inspection that
 * shows Completed always has a job behind it. The failure that matters most
 * is the duplicate one, because a second repair order for the same car is not
 * obviously wrong on screen; somebody discovers it when two technicians have
 * been booking hours against different numbers.
 */
const mockClaim = jest.fn();
const mockUpdateInspection = jest.fn();
const mockFetchJobCardById = jest.fn();
const mockCreateJobCard = jest.fn();
const mockFollowOns = jest.fn();

jest.mock('../inspectionService', () => ({
  claimInspectionJobCard: (...a: unknown[]) => mockClaim(...a),
  updateInspection: (...a: unknown[]) => mockUpdateInspection(...a),
}));
jest.mock('../jobCardService', () => ({
  fetchJobCardById: (...a: unknown[]) => mockFetchJobCardById(...a),
  createJobCard: (...a: unknown[]) => mockCreateJobCard(...a),
}));
jest.mock('../jobCardFollowOnService', () => ({
  createJobCardFollowOns: (...a: unknown[]) => mockFollowOns(...a),
}));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  completeInspection, summariseInspectionFindings, serviceTypeFromFindings,
} from '../inspectionCompletionService';
import type { Inspection } from '../inspectionService';

function inspection(over: Partial<Inspection> = {}): Inspection {
  return {
    id: 'ins-1',
    inspectionNumber: 'INS-00042',
    jobCardId: '',
    customerName: 'AI PENG',
    customerId: 'cust-9',
    vehicle: '2019 Toyota Land Cruiser Prado',
    vin: 'JT111',
    mileage: 48300,
    technician: 'Somchai',
    status: 'In Progress',
    items: [
      { id: 'i1', category: 'Brakes', name: 'Front brake pads', status: 'Fail', notes: 'worn to 2mm', photoUrl: 'p.jpg' },
      { id: 'i2', category: 'Fluids', name: 'Coolant', status: 'Attention', notes: 'low', photoUrl: '' },
      { id: 'i3', category: 'Lights', name: 'Headlights', status: 'Pass', notes: '', photoUrl: '' },
    ],
    notes: 'Squealing when braking downhill',
    customerEmail: '',
    customerPhone: '',
    createdAt: '2026-09-10T00:00:00Z',
    completedAt: null,
    customerApproval: null,
    ...over,
  };
}

beforeEach(() => {
  mockClaim.mockReset().mockResolvedValue('JC-1000');
  mockUpdateInspection.mockReset().mockResolvedValue(undefined);
  mockFetchJobCardById.mockReset().mockResolvedValue(null);
  mockCreateJobCard.mockReset().mockResolvedValue({ id: 'JC-1000' });
  mockFollowOns.mockReset().mockResolvedValue({
    roNumber: 'RO-00072', quotationCreated: true,
    roReused: false, quotationReused: false, errors: [],
  });
});

describe('completing an inspection', () => {
  it('creates the job card', async () => {
    const result = await completeInspection(inspection());

    expect(mockCreateJobCard).toHaveBeenCalledTimes(1);
    expect(mockCreateJobCard).toHaveBeenCalledWith(expect.objectContaining({
      id: 'JC-1000', customer: 'AI PENG', vehicle: '2019 Toyota Land Cruiser Prado',
    }));
    expect(result.jobCardId).toBe('JC-1000');
    expect(result.createdJobCard).toBe(true);
  });

  it('raises the repair order and the parts quotation against that job card', async () => {
    const result = await completeInspection(inspection());

    expect(mockFollowOns).toHaveBeenCalledWith(expect.objectContaining({
      jobCardId: 'JC-1000', customerId: 'cust-9', customerName: 'AI PENG',
    }));
    expect(result.roNumber).toBe('RO-00072');
    expect(result.quotationCreated).toBe(true);
  });

  it('stamps the job card id back onto the inspection', async () => {
    await completeInspection(inspection());

    expect(mockUpdateInspection).toHaveBeenCalledWith('ins-1', expect.objectContaining({
      status: 'Completed', jobCardId: 'JC-1000',
    }));
  });

  it('never quotes what nobody priced', async () => {
    // A job card raised from an inspection has had no labour estimated and no
    // parts chosen. It must not ask for figures at all: createJobCard now
    // writes zero hours and zero parts for everybody, and a caller passing
    // its own would be the way that gets undone one argument at a time.
    // See newJobHasNoFabricatedValues.test.ts for the guarantee itself.
    await completeInspection(inspection());
    const fields = mockCreateJobCard.mock.calls[0][0] as Record<string, unknown>;
    expect(fields).not.toHaveProperty('laborHours');
    expect(fields).not.toHaveProperty('partsTotal');
    expect(JSON.stringify(fields)).not.toMatch(/96\.5|1\.6/);
  });

  it('assigns the job to the technician who did the inspection', async () => {
    await completeInspection(inspection());
    expect(mockCreateJobCard).toHaveBeenCalledWith(
      expect.objectContaining({ technicians: ['Somchai'] }),
    );
  });
});

describe('findings carried into the job', () => {
  it('puts what failed into the job card notes', async () => {
    await completeInspection(inspection());

    const notes = mockCreateJobCard.mock.calls[0][0].notes as string;
    expect(notes).toContain('Front brake pads');
    expect(notes).toContain('worn to 2mm');
    expect(notes).toContain('Coolant');
    // The intake complaint reaches the inspection as its notes.
    expect(notes).toContain('Squealing when braking downhill');
    // A passing item is not a finding.
    expect(notes).not.toContain('Headlights');
  });

  it('hands the same summary to the repair order and quotation', async () => {
    await completeInspection(inspection());
    const findings = mockFollowOns.mock.calls[0][0].findings as string;
    expect(findings).toContain('Front brake pads');
    expect(findings).toContain('INS-00042');
  });

  it('counts the photos a technician attached', () => {
    expect(summariseInspectionFindings(inspection())).toContain('1 photo attached');
  });

  it('says so plainly when nothing failed', () => {
    const clean = inspection({
      items: [{ id: 'i1', category: 'Brakes', name: 'Front brake pads', status: 'Pass', notes: '', photoUrl: '' }],
    });
    expect(summariseInspectionFindings(clean)).toContain('No failed or flagged items.');
  });

  it('invents no prices, parts or severities', () => {
    const text = summariseInspectionFindings(inspection());
    expect(text).not.toMatch(/\$|USD|THB|\bqty\b|\bpart number\b/i);
  });
});

describe('the service type the job opens under', () => {
  it('follows the findings when they all point one way', () => {
    expect(serviceTypeFromFindings(inspection())).toBe('Brakes');
  });

  it('sees through a triage category suffix', () => {
    const ins = inspection({
      items: [{ id: 'i1', category: 'Brakes — Triage Checks', name: 'Pedal travel', status: 'Fail', notes: '', photoUrl: '' }],
    });
    expect(serviceTypeFromFindings(ins)).toBe('Brakes');
  });

  it('falls back rather than guessing when findings point several ways', () => {
    const ins = inspection({
      items: [
        { id: 'i1', category: 'Brakes', name: 'Pads', status: 'Fail', notes: '', photoUrl: '' },
        { id: 'i2', category: 'Tires', name: 'Front left', status: 'Fail', notes: '', photoUrl: '' },
      ],
    });
    expect(serviceTypeFromFindings(ins)).toBe('Inspection');
  });

  it('falls back for a category with no clean job-card equivalent', () => {
    const ins = inspection({
      items: [{ id: 'i1', category: 'Under Hood', name: 'Air filter', status: 'Fail', notes: '', photoUrl: '' }],
    });
    expect(serviceTypeFromFindings(ins)).toBe('Inspection');
  });
});

describe('pressed more than once', () => {
  it('reuses the job card the inspection already names', async () => {
    mockFetchJobCardById.mockResolvedValue({ id: 'JC-1000', customer: 'AI PENG' });
    mockFollowOns.mockResolvedValue({
      roNumber: 'RO-00072', quotationCreated: true,
      roReused: true, quotationReused: true, errors: [],
    });

    const result = await completeInspection(inspection({ jobCardId: 'JC-1000', status: 'Completed' }));

    expect(mockClaim).not.toHaveBeenCalled();
    expect(mockCreateJobCard).not.toHaveBeenCalled();
    expect(result.jobCardId).toBe('JC-1000');
    expect(result.createdJobCard).toBe(false);
    expect(result.alreadyComplete).toBe(true);
  });

  it('creates no second repair order or quotation', async () => {
    mockFetchJobCardById.mockResolvedValue({ id: 'JC-1000' });
    mockFollowOns.mockResolvedValue({
      roNumber: 'RO-00072', quotationCreated: true,
      roReused: true, quotationReused: true, errors: [],
    });

    const result = await completeInspection(inspection({ jobCardId: 'JC-1000' }));

    expect(result.roReused).toBe(true);
    expect(result.quotationReused).toBe(true);
    expect(result.roNumber).toBe('RO-00072');
  });

  it('takes the id the other caller won when two race for it', async () => {
    // claimInspectionJobCard hands back whoever won the UPDATE, which may not
    // be the id this call proposed. Everything downstream has to follow that
    // id, or the loser builds a second chain of records.
    mockClaim.mockResolvedValue('JC-WINNER');
    await completeInspection(inspection());

    expect(mockCreateJobCard).toHaveBeenCalledWith(expect.objectContaining({ id: 'JC-WINNER' }));
    expect(mockFollowOns).toHaveBeenCalledWith(expect.objectContaining({ jobCardId: 'JC-WINNER' }));
    expect(mockUpdateInspection).toHaveBeenCalledWith('ins-1', expect.objectContaining({ jobCardId: 'JC-WINNER' }));
  });

  it('shares one in-flight run between two taps in the same tab', async () => {
    const ins = inspection();
    const [a, b] = await Promise.all([completeInspection(ins), completeInspection(ins)]);

    expect(mockCreateJobCard).toHaveBeenCalledTimes(1);
    expect(mockFollowOns).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
  });

  it('keeps the original completion time', async () => {
    mockFetchJobCardById.mockResolvedValue({ id: 'JC-1000' });
    await completeInspection(inspection({ jobCardId: 'JC-1000', completedAt: '2026-09-01T10:00:00Z' }));

    expect(mockUpdateInspection).toHaveBeenCalledWith('ins-1', expect.objectContaining({
      completedAt: '2026-09-01T10:00:00Z',
    }));
  });
});

describe('when something fails', () => {
  it('does not mark the inspection complete if the job card cannot be created', async () => {
    mockCreateJobCard.mockRejectedValue(new Error('insert failed'));

    await expect(completeInspection(inspection())).rejects.toThrow('insert failed');
    expect(mockUpdateInspection).not.toHaveBeenCalled();
  });

  it('does not mark the inspection complete if the shop is not ours', async () => {
    // claimInspectionJobCard throws when the row is invisible under RLS —
    // another shop's inspection must not come back as completed here.
    mockClaim.mockRejectedValue(new Error('That inspection is not in this location'));

    await expect(completeInspection(inspection())).rejects.toThrow('not in this location');
    expect(mockCreateJobCard).not.toHaveBeenCalled();
    expect(mockUpdateInspection).not.toHaveBeenCalled();
  });

  it('still completes when only a follow-on record failed, and says which', async () => {
    // The job card is what the shop needs to start work. Losing it because a
    // quotation could not be filed would be the worse outcome.
    mockFollowOns.mockResolvedValue({
      roNumber: null, quotationCreated: true,
      roReused: false, quotationReused: false, errors: ['Repair order: rate limited'],
    });

    const result = await completeInspection(inspection());

    expect(mockUpdateInspection).toHaveBeenCalled();
    expect(result.errors).toEqual(['Repair order: rate limited']);
    expect(result.jobCardId).toBe('JC-1000');
  });

  it('lets a failed attempt be retried onto the same id', async () => {
    mockCreateJobCard.mockRejectedValueOnce(new Error('network'));
    await expect(completeInspection(inspection())).rejects.toThrow('network');

    // The id was already reserved on the inspection, so the retry carries it
    // rather than claiming a second one.
    mockFetchJobCardById.mockResolvedValue(null);
    const result = await completeInspection(inspection({ jobCardId: 'JC-1000' }));

    expect(result.jobCardId).toBe('JC-1000');
    expect(mockClaim).toHaveBeenCalledTimes(1);
  });
});

describe('customers and vehicles', () => {
  it('creates neither — it uses what the inspection already resolved', async () => {
    const src = readFileSync(join(__dirname, '..', 'inspectionCompletionService.ts'), 'utf8');

    // Intake creates the customer and the vehicle. Completing an inspection
    // that already names them must not make a second of either, which is the
    // duplicate-customer symptom a shop notices as two of the same name in
    // the list.
    expect(src).not.toMatch(/saveCustomer|saveVehicle|createCustomer|createVehicle/);
  });

  it('carries the inspection\'s own customer onto the job', async () => {
    await completeInspection(inspection({ customerId: 'cust-existing', customerName: 'AI PENG' }));

    expect(mockFollowOns).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'cust-existing', customerName: 'AI PENG',
    }));
    expect(mockCreateJobCard).toHaveBeenCalledWith(expect.objectContaining({ customer: 'AI PENG' }));
  });
});
