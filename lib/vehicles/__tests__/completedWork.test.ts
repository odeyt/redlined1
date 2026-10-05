import {
  mergeCompletedJobs, completedBetween, jobsByVehicle, vehicleKeys, latestCompletion, normKey,
  isFinishedRoStatus, isFinishedJobStatus, type RoRow, type JobRow,
} from '../completedWork';

const at = (y: number, m: number, d: number, h = 10) => new Date(y, m - 1, d, h).toISOString();

const ro = (over: Partial<RoRow> = {}): RoRow => ({
  id: 'ro-1', ro_number: 'RO-00001', job_card_id: 'JC-1', customer_name: 'AI JOY',
  vehicle: 'Camry', technician: 'KAT', status: 'Complete', closed_date: at(2026, 9, 10), ...over,
});
const job = (over: Partial<JobRow> = {}): JobRow => ({
  id: 'JC-9', customer: 'AI JOY', vehicle: 'Camry', technicians: ['KAT'], status: 'Closed',
  closed_date: at(2026, 9, 12), ...over,
});

describe('status helpers', () => {
  it('treats Complete and Closed repair orders as finished, not Open or Void', () => {
    expect(isFinishedRoStatus('Complete')).toBe(true);
    expect(isFinishedRoStatus('Closed')).toBe(true);
    expect(isFinishedRoStatus('Open')).toBe(false);
    expect(isFinishedRoStatus('Void')).toBe(false);
    expect(isFinishedRoStatus(null)).toBe(false);
  });

  it('treats Invoiced job cards as finished too', () => {
    expect(isFinishedJobStatus('Invoiced')).toBe(true);
    expect(isFinishedJobStatus('In Progress')).toBe(false);
  });
});

describe('mergeCompletedJobs', () => {
  it('keeps a repair order signed off in the period', () => {
    const jobs = mergeCompletedJobs([ro()], [], []);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ key: 'JC-1', roNumber: 'RO-00001', source: 'repair_order', vehicle: 'Camry' });
  });

  it('drops repair orders that are open, void, or have no closing date', () => {
    const jobs = mergeCompletedJobs([
      ro({ id: 'a', job_card_id: 'JC-A', status: 'Open' }),
      ro({ id: 'b', job_card_id: 'JC-B', status: 'Void' }),
      ro({ id: 'c', job_card_id: 'JC-C', closed_date: null }),
      ro({ id: 'd', job_card_id: 'JC-D', closed_date: 'garbage' }),
    ], [], []);
    expect(jobs).toEqual([]);
  });

  it('counts a job once when it is both a repair order and a closed archive row', () => {
    const jobs = mergeCompletedJobs([ro({ job_card_id: 'JC-1' })], [job({ id: 'JC-1' })], []);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].source).toBe('repair_order');
  });

  it('includes an archived job that has no repair order', () => {
    const jobs = mergeCompletedJobs([], [job({ id: 'JC-77' })], []);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ key: 'JC-77', source: 'closed_job', technician: 'KAT' });
  });

  it('includes an open job card only once it is marked finished', () => {
    const jobs = mergeCompletedJobs([], [], [
      job({ id: 'JC-1', status: 'In Progress' }),
      job({ id: 'JC-2', status: 'Complete' }),
    ]);
    expect(jobs.map(j => j.key)).toEqual(['JC-2']);
  });

  it('sorts newest first', () => {
    const jobs = mergeCompletedJobs([
      ro({ id: 'x', job_card_id: 'JC-X', closed_date: at(2026, 9, 1) }),
      ro({ id: 'y', job_card_id: 'JC-Y', closed_date: at(2026, 9, 20) }),
    ], [], []);
    expect(jobs.map(j => j.key)).toEqual(['JC-Y', 'JC-X']);
  });

  it('keys a repair order with no job card by its own id', () => {
    const jobs = mergeCompletedJobs([ro({ id: 'r9', job_card_id: '' })], [], []);
    expect(jobs[0].key).toBe('ro:r9');
  });
});

describe('completedBetween', () => {
  const jobs = mergeCompletedJobs([
    ro({ id: 'a', job_card_id: 'A', closed_date: at(2026, 8, 31, 23) }),
    ro({ id: 'b', job_card_id: 'B', closed_date: at(2026, 9, 1, 0) }),
    ro({ id: 'c', job_card_id: 'C', closed_date: at(2026, 9, 30, 23) }),
    ro({ id: 'd', job_card_id: 'D', closed_date: at(2026, 10, 1, 0) }),
  ], [], []);

  it('includes the first and last hour of the month and excludes the neighbours', () => {
    const inSep = completedBetween(jobs, at(2026, 9, 1, 0), at(2026, 10, 1, 0));
    expect(inSep.map(j => j.key).sort()).toEqual(['B', 'C']);
  });
});

describe('vehicleKeys', () => {
  it('builds label, plate, vin and label+plate keys, ignoring blanks and tiny keys', () => {
    expect(vehicleKeys({ id: '1', label: 'Honda Accord', plate: '#8979', vin: '' }).sort())
      .toEqual(['8979', 'hondaaccord', 'hondaaccord8979', '8979hondaaccord'].sort());
    expect(vehicleKeys({ id: '2', label: 'AB', plate: '' })).toEqual([]);
  });
});

describe('jobsByVehicle', () => {
  const vehicles = [
    { id: 'v1', label: 'Honda Accord #8979', plate: '#8979', vin: 'MRHCM56404P080656' },
    { id: 'v2', label: 'Toyota Lexus', plate: '#4151', vin: '' },
  ];
  const jobsFor = (vehicle: string) =>
    mergeCompletedJobs([ro({ id: vehicle, job_card_id: `JC-${vehicle}`, vehicle })], [], []);

  it('matches on the label as the job names it', () => {
    const m = jobsByVehicle(vehicles, jobsFor('Honda Accord #8979'));
    expect(m.get('v1')).toHaveLength(1);
  });

  it('matches on plate, VIN, or the label-plus-plate shape', () => {
    expect(jobsByVehicle(vehicles, jobsFor('#8979')).get('v1')).toHaveLength(1);
    expect(jobsByVehicle(vehicles, jobsFor('MRHCM56404P080656')).get('v1')).toHaveLength(1);
    expect(jobsByVehicle(vehicles, jobsFor('Toyota Lexus #4151')).get('v2')).toHaveLength(1);
  });

  it('ignores case, spacing and punctuation', () => {
    expect(jobsByVehicle(vehicles, jobsFor('  TOYOTA   lexus ')).get('v2')).toHaveLength(1);
  });

  it('does not attach a job whose vehicle matches nothing', () => {
    expect(jobsByVehicle(vehicles, jobsFor('Unknown Car')).size).toBe(0);
  });

  it('never guesses when two vehicles share the same name', () => {
    const twins = [
      { id: 'a', label: 'Ford Ranger', plate: '1111' },
      { id: 'b', label: 'Ford Ranger', plate: '2222' },
    ];
    expect(jobsByVehicle(twins, jobsFor('Ford Ranger')).size).toBe(0);
    // but each plate is unambiguous
    expect(jobsByVehicle(twins, jobsFor('1111')).get('a')).toHaveLength(1);
  });
});

describe('latestCompletion and normKey', () => {
  it('picks the most recent completion', () => {
    const jobs = mergeCompletedJobs([
      ro({ id: 'a', job_card_id: 'A', closed_date: at(2026, 9, 2) }),
      ro({ id: 'b', job_card_id: 'B', closed_date: at(2026, 9, 25) }),
    ], [], []);
    expect(latestCompletion(jobs)!.key).toBe('B');
    expect(latestCompletion([])).toBeNull();
    expect(latestCompletion(undefined)).toBeNull();
  });

  it('normalises text', () => {
    expect(normKey('Honda Accord #8979')).toBe('hondaaccord8979');
    expect(normKey(null)).toBe('');
  });
});
