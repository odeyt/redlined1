/**
 * The vehicle list as a CSV, for the search that is on screen.
 *
 * VIN is left out on purpose: it is shop-private and a CSV is easy to forward.
 * Cells are quote-escaped, and a cell that starts with a formula character is
 * defused so a vehicle name cannot run in a spreadsheet.
 */
export interface VehicleCsvRow {
  label: string;
  customer: string;
  yearMakeModel: string;
  plate: string;
  status: string;
  assignedTech: string;
  /** YYYY-MM-DD or empty */
  received: string;
  /** YYYY-MM-DD or empty */
  completed: string;
}

export function csvCell(value: string): string {
  const text = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return text.replace(/"/g, '""');
}

export function vehicleListCsv(rows: VehicleCsvRow[], includeCompleted: boolean): string[][] {
  const header = ['Vehicle', 'Customer', 'Year Make Model', 'Plate', 'Status', 'Assigned Tech', 'Received', ...(includeCompleted ? ['Completed'] : [])];
  return [
    header,
    ...rows.map(r =>
      [r.label, r.customer, r.yearMakeModel, r.plate, r.status, r.assignedTech, r.received, ...(includeCompleted ? [r.completed] : [])]
        .map(csvCell)),
  ];
}
