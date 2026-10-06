import {
  buildCompletedFilter, completedPeriod, inPeriod, describeCompleted, isBackwardsCompletedRange,
  COMPLETED_CUSTOM_RANGE,
} from '../completedPeriod';
import { matchesReportPeriod } from '../reportMonth';

// Built from the LOCAL calendar so these tests pass in any time zone.
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).toISOString();

describe('completedPeriod', () => {
  it('is null (no filter) when nothing is chosen', () => {
    expect(completedPeriod(buildCompletedFilter(0, 2026, '', ''))).toBeNull();
    expect(completedPeriod(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '', ''))).toBeNull();
  });

  it('covers one local calendar month, end exclusive', () => {
    const p = completedPeriod(buildCompletedFilter(9, 2026, '', ''))!;
    expect(p.startIso).toBe(at(2026, 9, 1, 0));
    expect(p.endIso).toBe(at(2026, 10, 1, 0));
  });

  it('rolls December into January', () => {
    expect(completedPeriod(buildCompletedFilter(12, 2026, '', ''))!.endIso).toBe(at(2027, 1, 1, 0));
  });

  it('includes both end days of a range in full', () => {
    const p = completedPeriod(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '2026-09-01', '2026-09-15'))!;
    expect(inPeriod(at(2026, 9, 1, 0, 0), p)).toBe(true);     // first minute of the first day
    expect(inPeriod(at(2026, 9, 15, 23, 59), p)).toBe(true);  // last minute of the last day
    expect(inPeriod(at(2026, 8, 31, 23, 59), p)).toBe(false);
    expect(inPeriod(at(2026, 9, 16, 0, 0), p)).toBe(false);
  });

  it('is open-ended when a bound is missing', () => {
    const from = completedPeriod(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '2026-09-10', ''))!;
    expect(inPeriod(at(2026, 9, 9), from)).toBe(false);
    expect(inPeriod(at(2026, 9, 10, 0, 0), from)).toBe(true);
    expect(inPeriod(at(2040, 1, 1), from)).toBe(true);

    const to = completedPeriod(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '', '2026-09-10'))!;
    expect(inPeriod(at(2001, 1, 1), to)).toBe(true);
    expect(inPeriod(at(2026, 9, 10, 23, 59), to)).toBe(true);
    expect(inPeriod(at(2026, 9, 11, 0, 0), to)).toBe(false);
  });

  it('covers a single day when from and to are the same', () => {
    const p = completedPeriod(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '2026-09-05', '2026-09-05'))!;
    expect(inPeriod(at(2026, 9, 5, 0, 0), p)).toBe(true);
    expect(inPeriod(at(2026, 9, 5, 23, 59), p)).toBe(true);
    expect(inPeriod(at(2026, 9, 6, 0, 0), p)).toBe(false);
  });

  it('covers nothing when from is after to', () => {
    const f = buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '2026-09-20', '2026-09-10');
    expect(isBackwardsCompletedRange(f)).toBe(true);
    const p = completedPeriod(f)!;
    expect(inPeriod(at(2026, 9, 15), p)).toBe(false);
    expect(inPeriod(at(2026, 9, 20, 0, 0), p)).toBe(false);
  });
});

describe('inPeriod', () => {
  it('has no restriction without a period, and drops unparseable dates under one', () => {
    expect(inPeriod('anything', null)).toBe(true);
    expect(inPeriod(null, null)).toBe(true);
    const p = completedPeriod(buildCompletedFilter(9, 2026, '', ''))!;
    expect(inPeriod('garbage', p)).toBe(false);
    expect(inPeriod(null, p)).toBe(false);
  });
});

describe('describeCompleted', () => {
  it('describes a month and a range in words', () => {
    expect(describeCompleted(buildCompletedFilter(9, 2026, '', ''))).toBe('September 2026');
    expect(describeCompleted(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '2026-09-01', '2026-09-15'))).toBe('1 Sep 2026 to 15 Sep 2026');
  });
});

describe('matchesReportPeriod (the vehicle-flag fallback)', () => {
  const sep = completedPeriod(buildCompletedFilter(9, 2026, '', ''));
  const range = completedPeriod(buildCompletedFilter(COMPLETED_CUSTOM_RANGE, 2026, '2026-09-10', '2026-09-20'));

  it('places a completed vehicle by its completion stamp', () => {
    expect(matchesReportPeriod({ status: 'Completed', completedAt: at(2026, 9, 15) }, sep)).toBe(true);
    expect(matchesReportPeriod({ status: 'Completed', completedAt: at(2026, 10, 2) }, sep)).toBe(false);
    expect(matchesReportPeriod({ status: 'Completed', completedAt: at(2026, 9, 15) }, range)).toBe(true);
    expect(matchesReportPeriod({ status: 'Completed', completedAt: at(2026, 9, 21) }, range)).toBe(false);
  });

  it('never places a vehicle that is not completed', () => {
    expect(matchesReportPeriod({ status: 'In Progress', completedAt: at(2026, 9, 15) }, sep)).toBe(false);
  });

  it('drops an unparseable date and lets everything through with no period', () => {
    expect(matchesReportPeriod({ status: 'Completed', completedAt: 'garbage' }, sep)).toBe(false);
    expect(matchesReportPeriod({ status: 'In Progress' }, null)).toBe(true);
  });
});
