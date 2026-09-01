/**
 * The completion-month rule, EXECUTED.
 *
 * Reported from production with a screenshot: COMPLETED IN was set to August
 * 2026 and the list returned cars received in March and July, at In Progress
 * and Pending Approval. 67 rows where 18 were completed in the month asked
 * for.
 *
 * The rule had a test. It matched the source text of the predicate, so it
 * passed while the predicate was wrong — the recurring failure in this
 * codebase. These run it instead, and the fixtures are the actual rows from
 * that screenshot.
 */
import {
  isCompletedStatus, reportDate, matchesReportMonth, type ReportableVehicle,
} from '../reportMonth';

const AUG = 8;
const YEAR = 2026;

/** The rows visible in the bug report. */
const SCREENSHOT: Array<ReportableVehicle & { name: string }> = [
  { name: 'AUDI Q7 #4444', status: 'In Progress', dateReceived: '2026-03-17', completedAt: null },
  { name: 'HYUNDAI I30 #1600', status: 'In Progress', dateReceived: '2026-07-23', completedAt: null },
  { name: 'LAND ROVER #9789', status: 'Pending Approval', dateReceived: '2026-07-16', completedAt: null },
  { name: 'LAND ROVER (no plate)', status: 'Active', dateReceived: '2026-08-11', completedAt: null },
  { name: 'MERCEDES S-CLASS #1975', status: 'In Progress', dateReceived: '2026-08-28', completedAt: null },
];

describe('the reported bug', () => {
  it('returns none of the rows the screenshot showed under August', () => {
    // Every one of them is open work. Not one was completed in August, or in
    // any month, so not one belongs in a completion report.
    const matched = SCREENSHOT.filter(v => matchesReportMonth(v, AUG, YEAR));
    expect(matched.map(v => v.name)).toEqual([]);
  });

  it('specifically excludes the March and July cars the owner objected to', () => {
    for (const name of ['AUDI Q7 #4444', 'HYUNDAI I30 #1600', 'LAND ROVER #9789']) {
      const v = SCREENSHOT.find(x => x.name === name)!;
      expect(matchesReportMonth(v, AUG, YEAR)).toBe(false);
    }
  });

  it('excludes an open job even when it ARRIVED in the selected month', () => {
    /**
     * The subtle half, and the one a looser fix would get wrong. Two cars in
     * the screenshot were received in August but are still open. "Received in
     * August" is not "completed in August", and a filter that let them through
     * would look fixed while still being wrong.
     */
    for (const name of ['LAND ROVER (no plate)', 'MERCEDES S-CLASS #1975']) {
      const v = SCREENSHOT.find(x => x.name === name)!;
      expect(v.dateReceived).toMatch(/^2026-08/);
      expect(matchesReportMonth(v, AUG, YEAR)).toBe(false);
    }
  });
});

describe('completed vehicles report under the month they finished', () => {
  it('matches on the completion date, not the arrival date', () => {
    // Received June, finished August: reports under August.
    const v = { status: 'Completed', dateReceived: '2026-06-28', completedAt: '2026-08-03' };
    expect(matchesReportMonth(v, AUG, YEAR)).toBe(true);
    expect(matchesReportMonth(v, 6, YEAR)).toBe(false);
  });

  it('does not report a car finished in a different month', () => {
    const v = { status: 'Completed', dateReceived: '2026-08-01', completedAt: '2026-09-02' };
    expect(matchesReportMonth(v, AUG, YEAR)).toBe(false);
  });

  it('matches month AND year, so July 2025 is not July 2026', () => {
    const v = { status: 'Completed', completedAt: '2025-07-04', dateReceived: null };
    expect(matchesReportMonth(v, 7, 2026)).toBe(false);
    expect(matchesReportMonth(v, 7, 2025)).toBe(true);
  });
});

describe('vehicles finished before the completion column existed', () => {
  /**
   * 18 of the 35 completed vehicles in production have no completedAt. They
   * fall back to the arrival date, which is the wrong date — and the UI counts
   * them and says so rather than mixing them in silently.
   */
  it('falls back to the arrival date so they are not lost entirely', () => {
    const v = { status: 'Completed', completedAt: null, dateReceived: '2026-08-20' };
    expect(reportDate(v)).toBe('2026-08-20');
    expect(matchesReportMonth(v, AUG, YEAR)).toBe(true);
  });

  it('still reports nothing when it has neither date', () => {
    const v = { status: 'Completed', completedAt: null, dateReceived: null };
    expect(reportDate(v)).toBeNull();
    expect(matchesReportMonth(v, AUG, YEAR)).toBe(false);
  });
});

describe('an open job belongs to no month', () => {
  it('reports no date at all, whatever its arrival date', () => {
    for (const status of ['In Progress', 'Pending Approval', 'Pending Parts', 'Active', 'Archived']) {
      expect(reportDate({ status, dateReceived: '2026-08-15', completedAt: null })).toBeNull();
    }
  });

  it('but is still shown when no month is selected', () => {
    // The floor view is the default, and it must keep working. Month 0 is
    // "Any month" and matches everything.
    const v = { status: 'In Progress', dateReceived: '2026-03-17', completedAt: null };
    expect(matchesReportMonth(v, 0, YEAR)).toBe(true);
  });
});

describe('status matching tolerates how the column is actually written', () => {
  it('accepts the spellings the data carries', () => {
    for (const s of ['Completed', 'Complete', 'completed', 'COMPLETED']) {
      expect(isCompletedStatus(s)).toBe(true);
    }
  });

  it('does not treat open statuses as complete', () => {
    for (const s of ['In Progress', 'Pending Approval', 'Active', 'Archived', '', null, undefined]) {
      expect(isCompletedStatus(s)).toBe(false);
    }
  });
});

describe('a bad date drops the row instead of taking the page down', () => {
  it('survives an unparseable value', () => {
    const v = { status: 'Completed', completedAt: 'not a date', dateReceived: null };
    expect(() => matchesReportMonth(v, AUG, YEAR)).not.toThrow();
    expect(matchesReportMonth(v, AUG, YEAR)).toBe(false);
  });
});
