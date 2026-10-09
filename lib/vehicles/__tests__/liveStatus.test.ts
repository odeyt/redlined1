import {
  toOpenJobs, liveStatus, chipForOpenRo, isOpenRoStatus, openJobsByVehicle, kanbanMoveCheck,
  splitTechnicians, withJobCardTechnicians, liveTechnicians,
  type OpenJob, type OpenRoRow,
} from '../liveStatus';
import { unlinkedByVehicle } from '../completedWork';

const row = (over: Partial<OpenRoRow> = {}): OpenRoRow => ({
  id: 'ro-1', ro_number: 'RO-00001', job_card_id: 'JC-1', customer_name: 'AI JOY',
  vehicle: 'Camry', technician: 'KAT', status: 'In Progress', opened_date: '2026-10-01', ...over,
});
const open = (status: string): OpenJob => toOpenJobs([row({ status })])[0];

describe('isOpenRoStatus', () => {
  it('treats Complete, Closed and Void as not open', () => {
    for (const s of ['Complete', 'Closed', 'Void', '', null, undefined]) expect(isOpenRoStatus(s as string)).toBe(false);
  });
  it('treats Open, In Progress and the two Pending statuses as open', () => {
    for (const s of ['Open', 'In Progress', 'Pending Parts', 'Pending Approval']) expect(isOpenRoStatus(s)).toBe(true);
  });
});

describe('toOpenJobs', () => {
  it('keeps open repair orders and drops finished ones', () => {
    const jobs = toOpenJobs([
      row({ id: 'a', job_card_id: 'JC-A', status: 'Open' }),
      row({ id: 'b', job_card_id: 'JC-B', status: 'Complete' }),
      row({ id: 'c', job_card_id: 'JC-C', status: 'Void' }),
    ]);
    expect(jobs.map(j => j.key)).toEqual(['JC-A']);
  });

  it('counts one job once even if two repair order rows share a job card', () => {
    expect(toOpenJobs([row({ id: 'a' }), row({ id: 'b' })])).toHaveLength(1);
  });

  it('keys a repair order with no job card by its own id', () => {
    expect(toOpenJobs([row({ id: 'r9', job_card_id: '' })])[0].key).toBe('ro:r9');
  });
});

describe('chipForOpenRo', () => {
  it('maps the repair order status to its chip', () => {
    expect(chipForOpenRo('Pending Approval')).toBe('Pending Approval');
    expect(chipForOpenRo('Pending Parts')).toBe('Pending Parts');
    expect(chipForOpenRo('In Progress')).toBe('In Progress');
    expect(chipForOpenRo('Open')).toBe('In Progress');
  });
});

describe('liveStatus', () => {
  it('follows the open repair order, whatever the flag says', () => {
    expect(liveStatus('Completed', [open('In Progress')])).toBe('In Progress');
    expect(liveStatus('Active', [open('Pending Parts')])).toBe('Pending Parts');
    expect(liveStatus('No open jobs', [open('Pending Approval')])).toBe('Pending Approval');
  });

  it('takes the most pressing of several open repair orders', () => {
    expect(liveStatus('', [open('In Progress'), open('Pending Parts'), open('Open')])).toBe('Pending Parts');
    expect(liveStatus('', [open('Pending Parts'), open('Pending Approval')])).toBe('Pending Approval');
  });

  it('keeps Returned Job, which says why the car is back', () => {
    expect(liveStatus('Returned Job', [open('In Progress')])).toBe('Returned Job');
  });

  it('keeps Archived, with or without open work', () => {
    expect(liveStatus('Archived', [open('In Progress')])).toBe('Archived');
    expect(liveStatus('Archived', [])).toBe('Archived');
  });

  it('demotes an in-shop flag that has no open repair order behind it', () => {
    expect(liveStatus('In Progress', [])).toBe('No open jobs');
    expect(liveStatus('Pending Approval', undefined)).toBe('No open jobs');
    expect(liveStatus('Pending Parts', [])).toBe('No open jobs');
  });

  it('keeps the flags that have no repair order meaning', () => {
    for (const f of ['Completed', 'Active', 'Pending', 'No open jobs', 'Returned Job']) {
      expect(liveStatus(f, [])).toBe(f);
    }
  });

  it('shows a blank flag with no open work as No open jobs', () => {
    expect(liveStatus('', [])).toBe('No open jobs');
    expect(liveStatus(null, undefined)).toBe('No open jobs');
  });
});

describe('openJobsByVehicle', () => {
  const vehicles = [
    { id: 'v1', label: 'Honda Accord', plate: '#8979' },
    { id: 'v2', label: 'Ford Ranger', plate: '1111' },
    { id: 'v3', label: 'Ford Ranger', plate: '2222' },
  ];
  const jobs = toOpenJobs([
    row({ id: 'a', job_card_id: 'JC-A', vehicle: 'Honda Accord #8979' }),
    row({ id: 'b', job_card_id: 'JC-B', vehicle: 'Ford Ranger' }),
    row({ id: 'c', job_card_id: 'JC-C', vehicle: 'Unknown Car' }),
  ]);

  it('links by name, and never guesses when a name is shared', () => {
    const by = openJobsByVehicle(vehicles, jobs);
    expect(by.get('v1')).toHaveLength(1);
    expect(by.has('v2')).toBe(false);
    expect(by.has('v3')).toBe(false);
  });

  it('reports the open jobs it could not link, with the reason', () => {
    const un = unlinkedByVehicle(vehicles, jobs);
    expect(un.map(u => [u.item.key, u.reason])).toEqual([['JC-B', 'ambiguous'], ['JC-C', 'no_vehicle']]);
  });
});

describe('kanbanMoveCheck', () => {
  it('lets a car with an open repair order be archived or marked returned, nothing else', () => {
    expect(kanbanMoveCheck('Archived', true).allowed).toBe(true);
    expect(kanbanMoveCheck('Returned Job', true).allowed).toBe(true);
  });

  it('refuses to move a car with an open repair order between the in-shop columns', () => {
    for (const t of ['In Progress', 'Pending Approval', 'Pending Parts']) {
      const r = kanbanMoveCheck(t, true);
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/follows its open repair order/);
    }
  });

  it('refuses to complete or deactivate a car that still has an open repair order', () => {
    for (const t of ['Completed', 'Active']) {
      const r = kanbanMoveCheck(t, true);
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/open repair order/);
    }
  });

  it('refuses to put a car with no open repair order into an in-shop column', () => {
    for (const t of ['In Progress', 'Pending Approval', 'Pending Parts']) {
      const r = kanbanMoveCheck(t, false);
      expect(r.allowed).toBe(false);
      expect(r.reason).toMatch(/no open repair order/);
    }
  });

  it('lets a car with no open repair order be moved to the hand-set columns', () => {
    for (const t of ['Completed', 'Active', 'Returned Job', 'Archived', 'No open jobs']) {
      expect(kanbanMoveCheck(t, false).allowed).toBe(true);
    }
  });
});

describe('splitTechnicians', () => {
  it('splits on semicolons and commas, trims, and drops blanks and Unassigned', () => {
    expect(splitTechnicians(' KAT ; BEE,  ; Unassigned')).toEqual(['KAT', 'BEE']);
    expect(splitTechnicians(null)).toEqual([]);
  });
});

describe('withJobCardTechnicians', () => {
  // The reported case: the repair order has no technician, the job card has one.
  const unassignedRo = toOpenJobs([row({ job_card_id: 'JC-2222', ro_number: 'RO-00020', technician: '' })]);

  it('adds the job card technicians found by job card id', () => {
    const [j] = withJobCardTechnicians(unassignedRo, [{ id: 'JC-2222', ro: null, technicians: ['WALLY'] }]);
    expect(j.technicians).toEqual(['WALLY']);
  });

  it('falls back to the RO number the job card records', () => {
    const noCardId = toOpenJobs([row({ job_card_id: '', ro_number: 'RO-00020', technician: '' })]);
    const [j] = withJobCardTechnicians(noCardId, [{ id: 'JC-X', ro: 'RO-00020', technicians: ['POPEYE'] }]);
    expect(j.technicians).toEqual(['POPEYE']);
  });

  it('keeps the repair order technician first and does not repeat a name', () => {
    const jobs = toOpenJobs([row({ job_card_id: 'JC-1', technician: 'KAT' })]);
    const [j] = withJobCardTechnicians(jobs, [{ id: 'JC-1', technicians: ['kat', 'BEE'] }]);
    expect(j.technicians).toEqual(['KAT', 'BEE']);
  });

  it('leaves a job alone when its job card has no technicians or is not found', () => {
    const jobs = toOpenJobs([row({ job_card_id: 'JC-1', technician: 'KAT' })]);
    expect(withJobCardTechnicians(jobs, [{ id: 'JC-1', technicians: [] }])[0]).toBe(jobs[0]);
    expect(withJobCardTechnicians(jobs, [{ id: 'JC-OTHER', technicians: ['BEE'] }])[0]).toBe(jobs[0]);
  });
});

describe('liveTechnicians', () => {
  const job = (technicians: string[]): OpenJob => ({ ...open('In Progress'), technicians });

  it('shows the open work technicians, not the vehicle field, when the work names any', () => {
    expect(liveTechnicians('OLD TECH', [job(['WALLY'])])).toEqual(['WALLY']);
  });

  it('combines technicians across open jobs without repeats', () => {
    expect(liveTechnicians('', [job(['WALLY']), job(['wally', 'KAT'])])).toEqual(['WALLY', 'KAT']);
  });

  it('uses the vehicle own Assigned Tech(s) when there is no open work or it names nobody', () => {
    expect(liveTechnicians('KAT; BEE', undefined)).toEqual(['KAT', 'BEE']);
    expect(liveTechnicians('KAT', [job([])])).toEqual(['KAT']);
    expect(liveTechnicians('', undefined)).toEqual([]);
  });
});
