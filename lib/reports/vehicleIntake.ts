/**
 * Vehicle intake report: which cars were received in a given month.
 *
 * "Received" is vehicles.date_received, a plain DATE, so the month is matched
 * with date-string bounds. That keeps the result identical in every time zone;
 * building the bounds from `new Date(y, m, 1)` would shift the edges for a
 * browser that is not in the shop's zone.
 *
 * Month 0 means "all months", which in this report means the whole selected
 * year, grouped by month.
 */

export interface IntakeRange {
  /** Inclusive, YYYY-MM-DD. */
  start: string;
  /** Exclusive, YYYY-MM-DD. */
  end: string;
}

export interface IntakeVehicle {
  id: string;
  label: string;
  plate: string;
  status: string;
  /** YYYY-MM-DD */
  dateReceived: string;
  customerName: string;
}

export interface IntakeGroup {
  key: string;
  label: string;
  count: number;
}

const pad = (n: number) => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function intakeRange(month: number, year: number): IntakeRange {
  if (month >= 1 && month <= 12) {
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` };
  }
  return { start: `${year}-01-01`, end: `${year + 1}-01-01` };
}

/** Vehicles whose received date falls inside the range, newest first. */
export function inIntakeRange<T extends { dateReceived: string | null }>(rows: T[], range: IntakeRange): T[] {
  return rows
    .filter(r => !!r.dateReceived && r.dateReceived.slice(0, 10) >= range.start && r.dateReceived.slice(0, 10) < range.end)
    .sort((a, b) => (b.dateReceived as string).localeCompare(a.dateReceived as string));
}

/**
 * Counts per day of the month (month > 0) or per month of the year (month 0).
 * Days or months with no intake are omitted.
 */
export function groupIntake(rows: Pick<IntakeVehicle, 'dateReceived'>[], month: number): IntakeGroup[] {
  const byKey = new Map<string, number>();
  for (const r of rows) {
    const key = month > 0 ? r.dateReceived.slice(8, 10) : r.dateReceived.slice(5, 7);
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

export function intakeCsvRows(rows: IntakeVehicle[]): string[][] {
  return [
    ['Date Received', 'Vehicle', 'Customer', 'Plate', 'Status'],
    ...rows.map(r => [r.dateReceived, r.label, r.customerName, r.plate, r.status].map(csvCell)),
  ];
}
