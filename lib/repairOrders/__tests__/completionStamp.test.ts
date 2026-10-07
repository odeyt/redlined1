import { completionDate, closedDateForStatusChange, isFinishedRoStatus } from '../completionStamp';

const NOW = new Date('2026-10-07T03:00:00.000Z');
const SEPT = '2026-09-15T08:00:00.000Z';

describe('isFinishedRoStatus', () => {
  it('treats Complete and Closed as finished', () => {
    expect(isFinishedRoStatus('Complete')).toBe(true);
    expect(isFinishedRoStatus('Closed')).toBe(true);
    for (const s of ['Open', 'In Progress', 'Pending Parts', 'Pending Approval', 'Void', '', null, undefined]) {
      expect(isFinishedRoStatus(s as string)).toBe(false);
    }
  });
});

describe('completionDate', () => {
  it('stamps now when an open order is completed', () => {
    expect(completionDate('In Progress', null, NOW)).toBe(NOW.toISOString());
  });

  it('stamps now, not the stale date, when a reopened order is completed again', () => {
    // The bug: a reopened order still carried its first completion date.
    expect(completionDate('In Progress', SEPT, NOW)).toBe(NOW.toISOString());
  });

  it('keeps the original date for an order that is already complete', () => {
    // e.g. raising the invoice a week after sign-off
    expect(completionDate('Complete', SEPT, NOW)).toBe(SEPT);
    expect(completionDate('Closed', SEPT, NOW)).toBe(SEPT);
  });

  it('stamps now for a complete order that somehow has no date', () => {
    expect(completionDate('Complete', null, NOW)).toBe(NOW.toISOString());
    expect(completionDate('Complete', '', NOW)).toBe(NOW.toISOString());
  });
});

describe('closedDateForStatusChange', () => {
  it('clears the completion date when a completed order is reopened', () => {
    expect(closedDateForStatusChange('In Progress', SEPT)).toBe('');
    expect(closedDateForStatusChange('Pending Parts', SEPT)).toBe('');
    expect(closedDateForStatusChange('Void', SEPT)).toBe('');
  });

  it('sends nothing when there is no date to clear', () => {
    expect(closedDateForStatusChange('In Progress', null)).toBeUndefined();
    expect(closedDateForStatusChange('In Progress', '')).toBeUndefined();
  });

  it('never clears the date of a finished status', () => {
    expect(closedDateForStatusChange('Complete', SEPT)).toBeUndefined();
    expect(closedDateForStatusChange('Closed', SEPT)).toBeUndefined();
  });
});
