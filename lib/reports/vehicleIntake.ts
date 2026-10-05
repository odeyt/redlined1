/**
 * Vehicle intake report: which cars were taken in during a given month.
 *
 * A car is "taken in" each time a job card is checked in for it, so the report
 * counts job-card check-ins (job_cards.check_in_date). That counts every visit:
 * a car that comes in during September and again in October appears in both
 * months, which a single "date received" on the vehicle can never do.
 *
 * Closing a job moves it from job_cards to closed_jobs, so callers read both
 * tables; a finished visit must not drop out of its month.
 *
 * Months and days are the browser's local calendar (the shop's), the same as the
 * other report tabs. Month 0 means "all months", which here means the selected
 * year, grouped by month.
 */

export interface IntakeRange {
  /** Inclusive start instant, ISO. */
  startIso: string;
  /** Exclusive end instant, ISO. */
  endIso: string;
}

export interface IntakeVisit {
  /** The job card id. */
  id: string;
  label: string;
  customerName: string;
  status: string;
  /** ISO timestamp of the check-in. */
  checkIn: string;
  /** Still an open job card, or already moved to the closed archive. */
  source: 'open' | 'closed';
}

export interface IntakeCar extends IntakeVisit {
  /** Job cards opened for this car on this day (1 for most). */
  jobCount: number;
}

export interface IntakeGroup {
  key: string;
  label: string;
  count: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function intakeRange(month: number, year: number): IntakeRange {
  const valid = month >= 1 && month <= 12;
  const start = valid ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const end = valid ? new Date(year, month, 1) : new Date(year + 1, 0, 1); // Date rolls December over
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** YYYY-MM-DD in the local calendar. */
export function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

/** The same physical car: vehicle name plus customer. */
const carKey = (v: Pick<IntakeVisit, 'label' | 'customerName'>) => `${norm(v.label)}|${norm(v.customerName)}`;

/** Visits whose check-in falls inside the range. Unparseable dates are dropped. */
export function inIntakeRange(visits: IntakeVisit[], range: IntakeRange): IntakeVisit[] {
  const start = Date.parse(range.startIso);
  const end = Date.parse(range.endIso);
  return visits.filter(v => {
    const t = Date.parse(v.checkIn);
    return Number.isFinite(t) && t >= start && t < end;
  });
}

/**
 * One row per car per day, newest first. Two job cards opened for the same car
 * on the same day are one arrival, not two; jobCount records how many.
 * The earliest check-in of the day is kept as the row's time.
 */
export function carsTakenIn(visits: IntakeVisit[]): IntakeCar[] {
  const byCarDay = new Map<string, IntakeCar>();
  for (const v of [...visits].sort((a, b) => Date.parse(a.checkIn) - Date.parse(b.checkIn))) {
    const key = `${carKey(v)}|${localDay(v.checkIn)}`;
    const existing = byCarDay.get(key);
    if (existing) existing.jobCount += 1;
    else byCarDay.set(key, { ...v, jobCount: 1 });
  }
  return [...byCarDay.values()].sort((a, b) => Date.parse(b.checkIn) - Date.parse(a.checkIn));
}

export interface IntakeSummary {
  /** Arrivals: one per car per day. */
  arrivals: number;
  /** Different cars, however many times they came in. */
  differentCars: number;
  customers: number;
  /** Job cards behind those arrivals. */
  jobCards: number;
}

export function summarizeIntake(cars: IntakeCar[]): IntakeSummary {
  return {
    arrivals: cars.length,
    differentCars: new Set(cars.map(carKey)).size,
    customers: new Set(cars.map(c => norm(c.customerName))).size,
    jobCards: cars.reduce((n, c) => n + c.jobCount, 0),
  };
}

/**
 * Arrivals per day of the month (month > 0) or per month of the year (month 0).
 * Days or months with none are omitted.
 */
export function groupIntake(cars: Pick<IntakeCar, 'checkIn'>[], month: number): IntakeGroup[] {
  const byKey = new Map<string, number>();
  for (const c of cars) {
    const day = localDay(c.checkIn); // YYYY-MM-DD
    const key = month > 0 ? day.slice(8, 10) : day.slice(5, 7);
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => ({
      key,
      count,
      label: month > 0 ? String(Number(key)) : MONTHS[Number(key) - 1],
    }));
}

/** A CSV cell that survives quotes and a leading formula character. */
export function csvCell(value: string): string {
  const text = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return text.replace(/"/g, '""');
}

export function intakeCsvRows(cars: IntakeCar[]): string[][] {
  return [
    ['Checked In', 'Vehicle', 'Customer', 'Job Card', 'Status', 'Job Cards That Day'],
    ...cars.map(c => [localDay(c.checkIn), c.label, c.customerName, c.id, c.status, String(c.jobCount)].map(csvCell)),
  ];
}
