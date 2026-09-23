/**
 * "Summit Auto & Fleet Service" — the fictional shop the marketing demo shows.
 *
 * Every row the demo seed writes is built here, by pure functions of `now`.
 * No dashboard number is written anywhere: the seed writes ordinary records
 * (customers, job cards, invoices, payments...) and the Command Center counts
 * them with its own queries, so every card, list and detail screen agrees.
 * __tests__/reconciliation.test.ts proves the counts by running the dataset
 * through the app's real MetricsBuilder and RuleRegistry.
 *
 * ## Fictional by construction
 *
 *   - Phone numbers are in 555-0100..0199, the range reserved for fiction.
 *   - Email addresses are at example.com, reserved by RFC 2606.
 *   - VINs start "DEMOVIN". A real VIN can never contain I or O, so these can
 *     never match a real vehicle, and no VIN decoder will resolve one.
 *   - Plates start "DEMO-", part numbers "DEMO-", documents "SAF-".
 *   - No name, vehicle or job is copied from D1 Imports or any customer.
 *
 * ## Stable identity (what makes the seed idempotent)
 *
 * Static records (customers, vehicles, technicians, parts) have fixed keys.
 * Dated records carry the local date of the run (`generation`, YYMMDD) in
 * their key, e.g. job card SAF-JC-260923-03. Running twice on one day finds
 * every key and writes nothing; running on a later day is a new generation.
 *
 * ## Money
 *
 * USD, no tax, labour at $140/h. Every document total is a whole multiple of
 * $10: the invoice and payment screens format through services/invoiceService
 * formatMoney, which rounds UP to the nearest 10 for display. Round totals
 * read identically there and on the Command Center.
 */
import {
  DEMO_TIME_ZONE, daysIntoMonth, generationKey, localDateString, localTime, todaySlot, todayWindow,
  type TodayWindow,
} from './clock';

export const SUMMIT = {
  shopName: 'Summit Auto & Fleet Service',
  timeZone: DEMO_TIME_ZONE,
  currency: 'USD',
  laborRate: 140,
  address: '1200 Summit Ridge Road, Sample City, IL (fictional)',
  phone: '(312) 555-0100',
  email: 'service@example.com',
  /** Marks every seeded customer, and is the prefix of every seeded document. */
  tag: 'demo-seed',
  docPrefix: 'SAF',
  note: 'Fictional record created by the Summit demo seed.',
} as const;

// ── Row types: exactly the columns written, in the app's own column names ──

export interface CustomerRow {
  id: string; name: string; type: string; phone: string; email: string;
  address: null; tags: string[]; follow_up: null;
}
export interface VehicleRow {
  customer_id: string; vin: string; label: string; trim: string; engine: string;
  mileage: string; plate: string; status: string; make: string; model: string; year: string;
}
export interface TechnicianRow {
  name: string; role: string; phone: null; email: null; specialty: string; status: string; notes: string;
}
export interface PartRow {
  part_number: string; brand: string; description: string; category: string; cost: number; retail: number;
  quantity: number; supplier: string; location: string; low_stock_threshold: number; currency: string; notes: string;
}
export interface JobCardRow {
  id: string; ro: string | null; invoice: string | null; customer: string; vehicle: string;
  service_type: string; channel: string; location: string; technicians: string[]; status: string;
  priority: string; approval: string; labor_hours: number; parts_total: number; workflow: string[];
  next_action: string; check_in_date: string; notes: string;
}
export interface ClosedJobRow extends Omit<JobCardRow, 'next_action' | 'notes'> {
  closed_date: string; created_at: string;
}
export interface Line { note: string; description: string; qty: number; rate: number }
export interface InvoiceRow {
  number: string; customer: string; customer_id: string; vehicle: string; job_card: null;
  status: 'Paid' | 'Sent'; lines: Line[]; discount: 0; shop_supplies: 0; tax_rate: 0;
  notes: string; due_date: string | null; paid_date: string | null; currency: string; created_at: string;
}
export interface EstimateRow {
  estimate_number: string; customer_name: string; customer_id: string; vehicle: string; job_card_id: null;
  status: 'Sent'; lines: Line[]; discount: 0; shop_supplies: 0; tax_rate: 0; notes: string;
  valid_until: string; currency: string; created_at: string;
}
export interface PaymentRow {
  invoice_number: string | null; customer_name: string; customer_id: string; amount: number; method: string;
  method_detail: string; status: 'Recorded'; notes: string; currency: string; reference_number: string;
  payment_date: string; entry_type: 'payment';
}
export interface RepairOrderRow {
  ro_number: string; job_card_id: string | null; invoice_number: string | null; customer_name: string;
  customer_id: string; vehicle: string; status: string; concern: string; cause: string; correction: string;
  technician: string; labor_hours: number; labor_rate: number; currency: string;
  parts: { description: string; partNumber: string; qty: number; unitCost: number }[]; parts_total: number;
  work_lines: { description: string; type: string; qty: number; rate: number }[]; opened_date: string;
}
export interface RepairCaseRow {
  ro_number: string; vin: null; make: string; model: string; year: string; mileage: number;
  complaint: string; technician_notes: string; final_fix: string; lesson_learned: string;
  labor_hours: number; confidence_score: number; verification_status: string;
  is_anonymized: true; share_to_network: false; created_at: string;
}

export interface SummitDataset {
  generation: string;
  window: TodayWindow;
  customers: CustomerRow[];
  vehicles: VehicleRow[];
  technicians: TechnicianRow[];
  parts: PartRow[];
  jobCards: JobCardRow[];
  closedJobs: ClosedJobRow[];
  repairOrders: RepairOrderRow[];
  invoices: InvoiceRow[];
  estimates: EstimateRow[];
  payments: PaymentRow[];
  repairCases: RepairCaseRow[];
}

// ── Static records ──────────────────────────────────────────────────────────

const customer = (n: number, name: string, type: 'Individual' | 'Fleet', email: string): CustomerRow => ({
  id: `C-SAF-DEMO-${String(n).padStart(2, '0')}`,
  name, type,
  phone: `(312) 555-01${String(n).padStart(2, '0')}`,
  email: `${email}@example.com`,
  address: null,
  tags: [SUMMIT.tag],
  follow_up: null,
});

const CUSTOMERS: CustomerRow[] = [
  customer(1, 'Maria Delgado', 'Individual', 'maria.delgado'),
  customer(2, 'James Whitaker', 'Individual', 'james.whitaker'),
  customer(3, 'Riverbend Courier Co.', 'Fleet', 'fleet.riverbend'),
  customer(4, 'Kevin Brennan', 'Individual', 'kevin.brennan'),
  customer(5, 'Patricia Nguyen', 'Individual', 'patricia.nguyen'),
  customer(6, 'Harbor Street Landscaping', 'Fleet', 'fleet.harborstreet'),
  customer(7, 'Anita Shah', 'Individual', 'anita.shah'),
  customer(8, 'Marcus Bell', 'Individual', 'marcus.bell'),
  customer(9, 'Laura Kim', 'Individual', 'laura.kim'),
  customer(10, 'Daniel Ortiz', 'Individual', 'daniel.ortiz'),
  customer(11, 'Sofia Petrova', 'Individual', 'sofia.petrova'),
  customer(12, 'Greenway Property Services', 'Fleet', 'fleet.greenway'),
  customer(13, 'Tom Hendricks', 'Individual', 'tom.hendricks'),
  customer(14, 'Rachel Moore', 'Individual', 'rachel.moore'),
  customer(15, 'Victor Alvarez', 'Individual', 'victor.alvarez'),
  customer(16, 'Emily Carter', 'Individual', 'emily.carter'),
];

const byName = (name: string): CustomerRow => {
  const c = CUSTOMERS.find(x => x.name === name);
  if (!c) throw new Error(`unknown demo customer ${name}`);
  return c;
};

interface VehicleSpec { plate: number; owner: string; year: string; make: string; model: string; trim: string; engine: string; miles: number; unit?: string }

const VEHICLE_SPECS: VehicleSpec[] = [
  { plate: 101, owner: 'Maria Delgado', year: '2019', make: 'Honda', model: 'CR-V', trim: 'EX', engine: '1.5L I4 Turbo', miles: 58210 },
  { plate: 102, owner: 'James Whitaker', year: '2017', make: 'Ford', model: 'F-150', trim: 'XLT', engine: '3.5L V6 EcoBoost', miles: 96440 },
  { plate: 103, owner: 'Riverbend Courier Co.', year: '2020', make: 'Ford', model: 'Transit 250', trim: 'Cargo', engine: '3.5L V6', miles: 112380, unit: 'Unit 12' },
  { plate: 104, owner: 'Riverbend Courier Co.', year: '2021', make: 'Ram', model: 'ProMaster 2500', trim: 'High Roof', engine: '3.6L V6', miles: 74105, unit: 'Unit 7' },
  { plate: 105, owner: 'Riverbend Courier Co.', year: '2019', make: 'Ford', model: 'Transit Connect', trim: 'XL', engine: '2.0L I4', miles: 88930, unit: 'Unit 3' },
  { plate: 106, owner: 'Kevin Brennan', year: '2016', make: 'Chevrolet', model: 'Malibu', trim: 'LT', engine: '1.5L I4 Turbo', miles: 103560 },
  { plate: 107, owner: 'Patricia Nguyen', year: '2015', make: 'Toyota', model: 'Camry', trim: 'SE', engine: '2.5L I4', miles: 121870 },
  { plate: 108, owner: 'Harbor Street Landscaping', year: '2018', make: 'Chevrolet', model: 'Silverado 2500HD', trim: 'WT', engine: '6.0L V8', miles: 139420, unit: 'Truck 2' },
  { plate: 109, owner: 'Harbor Street Landscaping', year: '2020', make: 'Ford', model: 'F-250', trim: 'XL', engine: '6.2L V8', miles: 81250, unit: 'Truck 4' },
  { plate: 110, owner: 'Anita Shah', year: '2014', make: 'Subaru', model: 'Outback', trim: '2.5i Premium', engine: '2.5L H4', miles: 104880 },
  { plate: 111, owner: 'Marcus Bell', year: '2018', make: 'Jeep', model: 'Grand Cherokee', trim: 'Limited', engine: '3.6L V6', miles: 76320 },
  { plate: 112, owner: 'Laura Kim', year: '2021', make: 'Toyota', model: 'RAV4', trim: 'XLE', engine: '2.5L I4', miles: 31940 },
  { plate: 113, owner: 'Daniel Ortiz', year: '2016', make: 'Nissan', model: 'Altima', trim: '2.5 SV', engine: '2.5L I4', miles: 98760 },
  { plate: 114, owner: 'Sofia Petrova', year: '2019', make: 'Hyundai', model: 'Tucson', trim: 'SEL', engine: '2.4L I4', miles: 64210 },
  { plate: 115, owner: 'Greenway Property Services', year: '2022', make: 'Ford', model: 'Transit 350', trim: 'Passenger', engine: '3.5L V6', miles: 42870, unit: 'Unit 21' },
  { plate: 116, owner: 'Greenway Property Services', year: '2020', make: 'Chevrolet', model: 'Express 2500', trim: 'Cargo', engine: '4.3L V6', miles: 91430, unit: 'Unit 14' },
  { plate: 117, owner: 'Tom Hendricks', year: '2013', make: 'Honda', model: 'Accord', trim: 'EX-L', engine: '2.4L I4', miles: 142610 },
  { plate: 118, owner: 'Rachel Moore', year: '2017', make: 'Mazda', model: 'CX-5', trim: 'Touring', engine: '2.5L I4', miles: 69880 },
  { plate: 119, owner: 'Victor Alvarez', year: '2015', make: 'Chevrolet', model: 'Tahoe', trim: 'LT', engine: '5.3L V8', miles: 128300 },
  { plate: 120, owner: 'Emily Carter', year: '2020', make: 'Kia', model: 'Sorento', trim: 'LX', engine: '2.4L I4', miles: 52140 },
];

const vehicleLabel = (v: VehicleSpec) => `${v.year} ${v.make} ${v.model}${v.unit ? ` (${v.unit})` : ''}`;
const specByPlate = (plate: number): VehicleSpec => {
  const v = VEHICLE_SPECS.find(x => x.plate === plate);
  if (!v) throw new Error(`unknown demo plate ${plate}`);
  return v;
};

const VEHICLES: VehicleRow[] = VEHICLE_SPECS.map(v => ({
  customer_id: byName(v.owner).id,
  vin: `DEMOVIN${String(v.plate).padStart(10, '0')}`,
  label: vehicleLabel(v),
  trim: v.trim,
  engine: v.engine,
  mileage: String(v.miles),
  plate: `DEMO-${v.plate}`,
  status: 'Active',
  make: v.make, model: v.model, year: v.year,
}));

const TECHNICIANS: TechnicianRow[] = [
  { name: 'Carol Jensen', role: 'Owner / Service Manager', specialty: 'Service advising, fleet accounts' },
  { name: 'Luis Romero', role: 'Master Technician', specialty: 'Engine, cooling and drivetrain' },
  { name: 'Jenna Walsh', role: 'Diagnostics Specialist', specialty: 'Electrical and drivability diagnosis' },
  { name: 'Andre Mitchell', role: 'Technician', specialty: 'Brakes, steering and suspension' },
  { name: 'Tyler Brooks', role: 'Lube & Tire Technician', specialty: 'Maintenance, tires and fleet PM' },
].map(t => ({ ...t, phone: null, email: null, status: 'Active', notes: SUMMIT.note }));

const part = (
  part_number: string, description: string, category: string, brand: string,
  cost: number, retail: number, quantity: number, low_stock_threshold: number, location: string,
): PartRow => ({
  part_number, description, category, brand, cost, retail, quantity, low_stock_threshold, location,
  supplier: 'Sample Parts Supply (fictional)', currency: SUMMIT.currency, notes: SUMMIT.note,
});

/** Four at or below their threshold — the "low inventory" the dashboard reports. */
export const LOW_STOCK_PART_NUMBERS = ['DEMO-BRK-PAD-F', 'DEMO-OIL-0W20-QT', 'DEMO-FLT-OIL-57', 'DEMO-CLT-5050-GAL'];

const PARTS: PartRow[] = [
  part('DEMO-BRK-PAD-F', 'Ceramic front brake pad set', 'Brakes', 'Sample Brand', 42, 95, 2, 6, 'A-1'),
  part('DEMO-OIL-0W20-QT', '0W-20 full synthetic oil (quart)', 'Fluids', 'Sample Brand', 5, 12, 8, 24, 'B-2'),
  part('DEMO-FLT-OIL-57', 'Spin-on oil filter', 'Filters', 'Sample Brand', 6, 16, 3, 10, 'B-3'),
  part('DEMO-CLT-5050-GAL', '50/50 extended-life coolant (gallon)', 'Fluids', 'Sample Brand', 14, 30, 1, 4, 'B-4'),
  part('DEMO-BRK-ROT-F', 'Front brake rotor', 'Brakes', 'Sample Brand', 58, 130, 8, 4, 'A-2'),
  part('DEMO-WPR-22', '22 in. wiper blade', 'Accessories', 'Sample Brand', 9, 30, 14, 6, 'C-1'),
  part('DEMO-BAT-H6-AGM', 'Group H6 AGM battery', 'Electrical', 'Sample Brand', 145, 240, 6, 2, 'D-1'),
  part('DEMO-SPK-IR', 'Iridium spark plug', 'Ignition', 'Sample Brand', 7, 18, 32, 12, 'C-2'),
  part('DEMO-FLT-AIR-12', 'Engine air filter', 'Filters', 'Sample Brand', 14, 45, 11, 5, 'B-5'),
  part('DEMO-FLT-CAB-08', 'Cabin air filter', 'Filters', 'Sample Brand', 12, 40, 9, 4, 'B-6'),
  part('DEMO-STR-F-QS', 'Front quick-strut assembly', 'Suspension', 'Sample Brand', 165, 300, 4, 2, 'E-1'),
  part('DEMO-BLT-SERP', 'Serpentine belt', 'Engine', 'Sample Brand', 28, 90, 7, 3, 'C-3'),
];

// ── Dated records ───────────────────────────────────────────────────────────

const L = (description: string, qty: number, rate: number, note = ''): Line => ({ note, description, qty, rate });
const labor = (description: string, hours: number, note = '') => L(description, hours, SUMMIT.laborRate, note);

export const lineTotal = (lines: readonly Line[]) => lines.reduce((s, l) => s + l.qty * l.rate, 0);

/** The documents, keyed by their role in the story. Totals are asserted in tests. */
const INVOICE_SPECS = {
  // Paid today, at pickup: these three are Revenue Today.
  brakes:     { customer: 'Maria Delgado', plate: 101, lines: [labor('Brake service labor — four wheels', 3.5), L('Front ceramic brake pads', 1, 150), L('Rear ceramic brake pads', 1, 130), L('Front rotors (pair)', 1, 260), L('Rear rotors (pair)', 1, 220), L('Brake fluid exchange', 1, 130)] },
  cooling:    { customer: 'James Whitaker', plate: 102, lines: [labor('Cooling system labor', 3.0), L('Water pump', 1, 310), L('Thermostat & housing', 1, 120), L('Extended-life coolant (gal)', 4, 30), L('Serpentine belt', 1, 90), L('Upper & lower radiator hoses', 1, 100)] },
  struts:     { customer: 'Riverbend Courier Co.', plate: 103, lines: [labor('Front strut replacement labor', 3.5), L('Front quick-strut assemblies', 2, 300), L('Four-wheel alignment', 1, 150), L('Strut mount hardware kit', 1, 80)] },
  // Completed this month, invoiced, not yet due.
  fleetPm:    { customer: 'Riverbend Courier Co.', plate: 104, lines: [labor('Fleet PM-A labor', 2.0), L('0W-20 synthetic oil (qt)', 7, 12), L('Oil filter', 1, 16), L('Engine air filter', 1, 45), L('Cabin air filter', 1, 40), L('Wiper blades', 2, 30), L('Tire rotation', 1, 25)] },
  drain:      { customer: 'Kevin Brennan', plate: 106, lines: [labor('Parasitic draw diagnosis', 1.5), labor('Circuit repair labor', 2.0), L('Group H6 AGM battery', 1, 240), L('Relay', 1, 65), L('Harness repair kit', 1, 65)] },
  // Overdue.
  acClutch:   { customer: 'Patricia Nguyen', plate: 107, lines: [labor('A/C diagnosis & repair labor', 2.5), L('A/C compressor clutch kit', 1, 330), L('R-1234yf refrigerant charge', 1, 110), L('Dye & O-ring kit', 1, 50)] },
  wheelBear:  { customer: 'Harbor Street Landscaping', plate: 108, lines: [labor('Rear hub & brake labor', 2.0), L('Rear hub bearing assembly', 1, 240), L('Rear brake pads', 1, 120)] },
} as const;

const ESTIMATE_SPECS = {
  frontEnd:     { customer: 'Victor Alvarez', plate: 119, daysAgo: 5, lines: [labor('Front end rebuild labor', 4.0), L('Lower control arms', 2, 260), L('Outer tie rod ends', 2, 85), L('Sway bar end links', 2, 75), L('Four-wheel alignment', 1, 150), L('Hardware & fasteners', 1, 100)] },
  driveline:    { customer: 'Harbor Street Landscaping', plate: 109, daysAgo: 8, lines: [labor('Driveline service labor', 4.0), L('ATF (qt)', 12, 20), L('Transmission filter & gasket kit', 1, 120), L('Front differential service', 1, 150), L('Rear differential service', 1, 150), L('Transfer case service', 1, 200)] },
  evaporator:   { customer: 'Tom Hendricks', plate: 117, daysAgo: 12, lines: [labor('A/C evaporator replacement labor', 4.5), L('A/C evaporator core', 1, 360), L('Blend door actuator', 1, 90), L('Refrigerant charge', 1, 100)] },
  // Sent today: open, not stale.
  rearBrakes:   { customer: 'Laura Kim', plate: 112, daysAgo: 0, lines: [labor('Rear brake labor', 1.5), L('Rear brake pads', 1, 120), L('Rear rotors (pair)', 1, 220), L('Brake fluid exchange', 1, 140)] },
} as const;

export function buildSummitDataset(now: Date): SummitDataset {
  const g = generationKey(now);
  const window = todayWindow(now);
  const doc = (kind: string, n: number) => `${SUMMIT.docPrefix}-${kind}-${g}-${String(n).padStart(2, '0')}`;
  const at = (dayOffset: number, hour: number, minute = 0) => localTime(now, dayOffset, hour, minute).toISOString();
  const date = (dayOffset: number) => localDateString(now, dayOffset);
  // Today's instants, spread evenly through the part of today both clocks agree on.
  const TODAY_SLOTS = 16;
  const today = (i: number) => todaySlot(window, i, TODAY_SLOTS).toISOString();
  // "Earlier this month": never before the 1st, so "this month" holds on any day it runs.
  const thisMonth = (daysBack: number) => -Math.min(daysBack, daysIntoMonth(now));

  const cust = (name: string) => byName(name);
  const veh = (plate: number) => vehicleLabel(specByPlate(plate));

  // ── Open job cards: eight, across the workflow. One stuck, two high priority.
  const open = (
    n: number, name: string, plate: number, service_type: string, status: string, priority: string,
    technicians: string[], checkIn: string, notes: string, ro: boolean, next_action: string,
  ): JobCardRow => {
    const workflow: Record<string, string[]> = {
      Booked: ['Booked'], Approved: ['Booked', 'Approved'],
      'In Progress': ['Booked', 'Approved', 'In Progress'],
      'Pending Parts': ['Booked', 'Approved', 'In Progress', 'Pending Parts'],
    };
    return {
      id: doc('JC', n), ro: ro ? doc('RO', n) : null, invoice: null, customer: cust(name).name, vehicle: veh(plate),
      service_type, channel: 'Shop bay', location: '', technicians, status, priority,
      approval: status === 'Booked' ? 'Pending' : 'Approved', labor_hours: 0, parts_total: 0,
      workflow: workflow[status], next_action, check_in_date: checkIn, notes,
    };
  };
  const jobCards: JobCardRow[] = [
    open(1, 'Laura Kim', 112, 'Oil Change', 'Booked', 'Normal', [], today(0), 'Synthetic oil service and tire rotation.', false, 'Request approval'),
    open(2, 'Anita Shah', 110, 'Engine', 'Approved', 'Normal', ['Luis Romero'], today(1), 'Timing belt and water pump — customer approved, parts deposit taken.', false, 'Convert to repair order'),
    open(3, 'Marcus Bell', 111, 'Brakes', 'In Progress', 'High', ['Andre Mitchell'], today(2), 'Grinding on braking; front pads to backing plate.', true, 'Complete repair'),
    open(4, 'Daniel Ortiz', 113, 'Engine', 'In Progress', 'Normal', ['Luis Romero'], at(-1, 9, 30), 'Overheating in traffic; radiator and thermostat.', true, 'Complete repair'),
    // The intentionally stuck job: checked in five days ago, waiting on a backordered alternator.
    open(5, 'Tom Hendricks', 117, 'Electrical', 'Pending Parts', 'High', ['Jenna Walsh'], at(-5, 8, 15), 'Charging system fault. Alternator on backorder from supplier.', true, 'Chase backordered alternator'),
    open(6, 'Sofia Petrova', 114, 'Diagnostics', 'In Progress', 'Normal', ['Jenna Walsh'], at(-1, 13, 0), 'Check-engine light, cylinder 3 misfire.', true, 'Complete diagnosis'),
    open(7, 'Greenway Property Services', 115, 'Preventive Maintenance', 'Approved', 'Normal', ['Tyler Brooks'], at(-1, 15, 45), 'Fleet PM-B service, Unit 21.', false, 'Convert to repair order'),
    open(8, 'Victor Alvarez', 119, 'Inspection', 'Booked', 'Normal', [], today(3), 'Clunk over bumps; front suspension inspection.', false, 'Request approval'),
  ];

  // ── Completed, not yet invoiced: two, on the board as Completed with no invoice.
  const done = (n: number, name: string, plate: number, service_type: string, tech: string, checkIn: string, hours: number, parts: number, notes: string): JobCardRow => ({
    id: doc('JC', n), ro: doc('RO', n), invoice: null, customer: cust(name).name, vehicle: veh(plate),
    service_type, channel: 'Shop bay', location: '', technicians: [tech], status: 'Completed', priority: 'Normal',
    approval: 'Approved', labor_hours: hours, parts_total: parts,
    workflow: ['Booked', 'Approved', 'In Progress', 'Completed'], next_action: 'Create invoice', check_in_date: checkIn, notes,
  });
  jobCards.push(
    done(9, 'Rachel Moore', 118, 'Brakes', 'Andre Mitchell', at(-1, 10, 0), 4.5, 480, 'Rear brakes and caliper service. Ready for invoicing.'),
    done(10, 'Emily Carter', 120, 'Alignment', 'Andre Mitchell', today(4), 3.5, 580, 'Front struts and four-wheel alignment. Ready for invoicing.'),
  );

  // ── Invoices.
  const inv = (n: number, key: keyof typeof INVOICE_SPECS, status: 'Paid' | 'Sent', createdAt: string, dueDate: string | null, paidDate: string | null, notes: string): InvoiceRow => {
    const spec = INVOICE_SPECS[key];
    return {
      number: doc('INV', n), customer: spec.customer, customer_id: cust(spec.customer).id, vehicle: veh(spec.plate),
      // Closed jobs live in closed_jobs, not job_cards, so there is no job card row to point at.
      job_card: null,
      status, lines: spec.lines.map(l => ({ ...l })), discount: 0, shop_supplies: 0, tax_rate: 0,
      notes, due_date: dueDate, paid_date: paidDate, currency: SUMMIT.currency, created_at: createdAt,
    };
  };
  const closeDayFleet = thisMonth(1);
  const closeDayDrain = thisMonth(3);
  const invoices: InvoiceRow[] = [
    inv(1, 'brakes', 'Paid', today(5), null, today(8), 'Paid at pickup.'),
    inv(2, 'cooling', 'Paid', today(6), null, today(9), 'Paid at pickup.'),
    inv(3, 'struts', 'Paid', today(7), null, today(10), 'Fleet account — paid by bank transfer.'),
    inv(4, 'fleetPm', 'Sent', at(closeDayFleet, 16, 0), date(closeDayFleet + 30), null, 'Fleet account, net 30.'),
    inv(5, 'drain', 'Sent', at(closeDayDrain, 17, 0), date(closeDayDrain + 14), null, 'Net 14.'),
    inv(6, 'acClutch', 'Sent', at(-26, 16, 30), date(-12), null, 'Net 14. Reminder sent.'),
    inv(7, 'wheelBear', 'Sent', at(-19, 11, 0), date(-5), null, 'Fleet account, net 14.'),
  ];

  // ── The five jobs completed this month, archived as the app archives them.
  const closed = (n: number, invoiceN: number, key: keyof typeof INVOICE_SPECS, service_type: string, tech: string, closedAt: string, checkIn: string): ClosedJobRow => {
    const spec = INVOICE_SPECS[key];
    const laborLines = spec.lines.filter(l => l.rate === SUMMIT.laborRate);
    const hours = laborLines.reduce((s, l) => s + l.qty, 0);
    return {
      id: doc('JC', n), ro: doc('RO', n), invoice: doc('INV', invoiceN), customer: spec.customer, vehicle: veh(spec.plate),
      service_type, channel: 'Shop bay', location: '', technicians: [tech], status: 'Closed', priority: 'Normal',
      approval: 'Approved', labor_hours: hours, parts_total: lineTotal(spec.lines) - hours * SUMMIT.laborRate,
      workflow: ['Booked', 'Approved', 'In Progress', 'Completed', 'Closed'], check_in_date: checkIn,
      closed_date: closedAt, created_at: checkIn,
    };
  };
  const closedJobs: ClosedJobRow[] = [
    closed(11, 1, 'brakes', 'Brakes', 'Andre Mitchell', today(5), at(-1, 8, 30)),
    closed(12, 2, 'cooling', 'Engine', 'Luis Romero', today(6), at(-1, 9, 0)),
    closed(13, 3, 'struts', 'Alignment', 'Andre Mitchell', today(7), at(-2, 8, 0)),
    closed(14, 4, 'fleetPm', 'Preventive Maintenance', 'Tyler Brooks', at(closeDayFleet, 16, 0), at(closeDayFleet, 8, 0)),
    closed(15, 5, 'drain', 'Electrical', 'Jenna Walsh', at(closeDayDrain, 17, 0), at(closeDayDrain - 1, 9, 0)),
  ];

  // ── Repair orders: the four open jobs in the bay, plus the five completed ones.
  const ro = (
    n: number, jobCardId: string | null, name: string, plate: number, status: string, tech: string, opened: string,
    concern: string, cause: string, correction: string, work: { description: string; type: string; qty: number }[],
    parts: { description: string; partNumber: string; qty: number; unitCost: number }[], invoiceNumber: string | null,
  ): RepairOrderRow => ({
    ro_number: doc('RO', n), job_card_id: jobCardId, invoice_number: invoiceNumber, customer_name: cust(name).name,
    customer_id: cust(name).id, vehicle: veh(plate), status, concern, cause, correction, technician: tech,
    labor_hours: work.reduce((s, w) => s + w.qty, 0), labor_rate: SUMMIT.laborRate, currency: SUMMIT.currency,
    parts, parts_total: parts.reduce((s, p) => s + p.qty * p.unitCost, 0),
    work_lines: work.map(w => ({ ...w, rate: SUMMIT.laborRate })), opened_date: opened,
  });
  const repairOrders: RepairOrderRow[] = [
    ro(3, doc('JC', 3), 'Marcus Bell', 111, 'In Progress', 'Andre Mitchell', jobCards[2].check_in_date,
      'Grinding noise when braking.', 'Front pads worn to backing plate; rotors scored.', 'Replace front pads and rotors, bleed brakes.',
      [{ description: 'Front brake pads & rotors', type: 'Labor', qty: 2.0 }],
      [{ description: 'Ceramic front brake pad set', partNumber: 'DEMO-BRK-PAD-F', qty: 1, unitCost: 95 }, { description: 'Front brake rotor', partNumber: 'DEMO-BRK-ROT-F', qty: 2, unitCost: 130 }], null),
    ro(4, doc('JC', 4), 'Daniel Ortiz', 113, 'In Progress', 'Luis Romero', jobCards[3].check_in_date,
      'Temperature gauge climbs in traffic.', 'Radiator core clogged; thermostat sticking closed.', 'Replace radiator and thermostat, pressure test.',
      [{ description: 'Cooling system diagnosis', type: 'Diagnostic', qty: 1.0 }, { description: 'Radiator & thermostat replacement', type: 'Labor', qty: 2.5 }],
      [{ description: '50/50 extended-life coolant (gallon)', partNumber: 'DEMO-CLT-5050-GAL', qty: 2, unitCost: 30 }], null),
    ro(5, doc('JC', 5), 'Tom Hendricks', 117, 'Pending Parts', 'Jenna Walsh', jobCards[4].check_in_date,
      'Battery light on; car died twice.', 'Alternator output 11.8 V at idle; diode failure.', 'Replace alternator once the backordered unit arrives.',
      [{ description: 'Charging system diagnosis', type: 'Diagnostic', qty: 1.0 }],
      [], null),
    ro(6, doc('JC', 6), 'Sofia Petrova', 114, 'In Progress', 'Jenna Walsh', jobCards[5].check_in_date,
      'Check-engine light, rough idle.', 'Cylinder 3 misfire follows the ignition coil.', 'Replace ignition coil and spark plugs.',
      [{ description: 'Misfire diagnosis', type: 'Diagnostic', qty: 1.0 }, { description: 'Ignition coil & plugs', type: 'Labor', qty: 1.0 }],
      [{ description: 'Iridium spark plug', partNumber: 'DEMO-SPK-IR', qty: 4, unitCost: 18 }], null),
    ...closedJobs.map((c, i) => {
      const spec = INVOICE_SPECS[(['brakes', 'cooling', 'struts', 'fleetPm', 'drain'] as const)[i]];
      const labour = spec.lines.filter(l => l.rate === SUMMIT.laborRate);
      const partLines = spec.lines.filter(l => l.rate !== SUMMIT.laborRate);
      return ro(11 + i, null, spec.customer, spec.plate, 'Complete', c.technicians[0], c.check_in_date,
        `${c.service_type} service requested.`, 'See technician notes.', spec.lines[0].description,
        labour.map(l => ({ description: l.description, type: 'Labor', qty: l.qty })),
        partLines.map(l => ({ description: l.description, partNumber: '', qty: l.qty, unitCost: l.rate })), c.invoice);
    }),
  ];

  // ── Estimates: three stale (sent 5, 8 and 12 days ago), one sent today.
  const estimates: EstimateRow[] = (Object.keys(ESTIMATE_SPECS) as (keyof typeof ESTIMATE_SPECS)[]).map((key, i) => {
    const spec = ESTIMATE_SPECS[key];
    const created = spec.daysAgo === 0 ? today(11) : at(-spec.daysAgo, 11, 0);
    return {
      estimate_number: doc('EST', i + 1), customer_name: spec.customer, customer_id: cust(spec.customer).id,
      vehicle: veh(spec.plate), job_card_id: null, status: 'Sent', lines: spec.lines.map(l => ({ ...l })),
      discount: 0, shop_supplies: 0, tax_rate: 0, notes: 'Sent to customer for approval.',
      valid_until: date(30 - spec.daysAgo), currency: SUMMIT.currency, created_at: created,
    };
  });

  // ── Payments today: the three invoices paid at pickup, plus three parts deposits.
  const pay = (n: number, name: string, amount: number, method: string, invoiceNumber: string | null, notes: string, when: string): PaymentRow => ({
    invoice_number: invoiceNumber, customer_name: cust(name).name, customer_id: cust(name).id, amount, method,
    method_detail: '', status: 'Recorded', notes, currency: SUMMIT.currency, reference_number: doc('PAY', n),
    payment_date: when, entry_type: 'payment',
  });
  const paidTotal = (n: number) => lineTotal(invoices[n - 1].lines);
  const payments: PaymentRow[] = [
    pay(1, 'Maria Delgado', paidTotal(1), 'Credit Card', doc('INV', 1), 'Paid at pickup.', today(8)),
    pay(2, 'James Whitaker', paidTotal(2), 'Debit Card', doc('INV', 2), 'Paid at pickup.', today(9)),
    pay(3, 'Riverbend Courier Co.', paidTotal(3), 'Bank Transfer', doc('INV', 3), 'Fleet account payment.', today(10)),
    pay(4, 'Anita Shah', 620, 'Credit Card', null, `Parts deposit — timing belt kit (${doc('JC', 2)}).`, today(12)),
    pay(5, 'Greenway Property Services', 460, 'Check', null, `Parts deposit — fleet PM-B (${doc('JC', 7)}).`, today(13)),
    pay(6, 'Victor Alvarez', 300, 'Cash', null, `Deposit for suspension inspection and parts (${doc('JC', 8)}).`, today(14)),
  ];

  // ── Repair cases documented today, one per completed job.
  const rc = (i: number, complaint: string, notes: string, fix: string, lesson: string, confidence: number): RepairCaseRow => {
    const c = closedJobs[i];
    const spec = specByPlate(INVOICE_SPECS[(['brakes', 'cooling', 'struts', 'fleetPm', 'drain'] as const)[i]].plate);
    return {
      ro_number: c.ro as string, vin: null, make: spec.make, model: spec.model, year: spec.year, mileage: spec.miles,
      complaint, technician_notes: notes, final_fix: fix, lesson_learned: lesson, labor_hours: c.labor_hours,
      confidence_score: confidence, verification_status: 'verified', is_anonymized: true, share_to_network: false,
      created_at: today(15 - i),
    };
  };
  const repairCases: RepairCaseRow[] = [
    rc(0, 'Pulsation and squeal when braking.', 'Front rotors 0.004 in. runout; rear pads at 2 mm.', 'Four-wheel pads and rotors, fluid exchange.', 'Measure rotor runout before quoting pads alone.', 92),
    rc(1, 'Coolant smell and slow leak at front of engine.', 'Weep hole at water pump wet; thermostat slow to open.', 'Water pump, thermostat, belt and hoses replaced.', 'Replace thermostat with the pump on this engine — same labor.', 88),
    rc(2, 'Van wanders at highway speed; front clunk.', 'Front strut mounts collapsed; toe out of spec.', 'Front quick-struts and alignment.', 'Fleet vans over 100k miles: inspect strut mounts at every PM.', 90),
    rc(3, 'Scheduled fleet PM-A.', 'No faults. Cabin filter heavily loaded.', 'PM-A completed per fleet schedule.', 'Cabin filters on courier vans need a shorter interval.', 85),
    rc(4, 'Battery dead after sitting overnight.', 'Parasitic draw 420 mA; traced to a stuck relay.', 'Relay replaced, harness repaired, new battery.', 'Check relay circuits before condemning the battery.', 87),
  ];

  return {
    generation: g, window,
    customers: CUSTOMERS.map(c => ({ ...c, tags: [...c.tags] })),
    vehicles: VEHICLES.map(v => ({ ...v })),
    technicians: TECHNICIANS.map(t => ({ ...t })),
    parts: PARTS.map(p => ({ ...p })),
    jobCards, closedJobs, repairOrders, invoices, estimates, payments, repairCases,
  };
}

/**
 * What the Command Center should show for a freshly seeded demo shop,
 * computed from the dataset itself (never typed in) so a change to the data
 * moves the expectation with it.
 */
export function expectedTotals(d: SummitDataset) {
  const total = (lines: readonly Line[]) => lineTotal(lines);
  // The server's definitions (MetricsBuilder on a UTC host): midnight UTC, N days back.
  const end = d.window.end;
  const utcMidnight = (daysBack: number) =>
    new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - daysBack)).toISOString();
  const todayStart = utcMidnight(0).slice(0, 10);
  const paidToday = d.invoices.filter(i => i.status === 'Paid' && (i.paid_date ?? '').slice(0, 10) >= todayStart);
  const unpaid = d.invoices.filter(i => i.status !== 'Paid');
  const overdue = unpaid.filter(i => i.due_date !== null && i.due_date < todayStart);
  const stale = d.estimates.filter(e => e.created_at < utcMidnight(3));
  const notInvoiced = d.jobCards.filter(j => j.status === 'Completed' && !j.invoice);
  return {
    customers: d.customers.length,
    vehicles: d.vehicles.length,
    technicians: d.technicians.length,
    openJobs: d.jobCards.filter(j => j.status !== 'Completed').length,
    completedThisMonth: d.closedJobs.length,
    paymentsToday: d.payments.length,
    paymentsTodayTotal: d.payments.reduce((s, p) => s + p.amount, 0),
    revenueToday: paidToday.reduce((s, i) => s + total(i.lines), 0),
    unpaidInvoices: unpaid.length,
    unpaidTotal: unpaid.reduce((s, i) => s + total(i.lines), 0),
    overdueInvoices: overdue.length,
    overdueTotal: overdue.reduce((s, i) => s + total(i.lines), 0),
    staleEstimates: stale.length,
    staleTotal: stale.reduce((s, e) => s + total(e.lines), 0),
    completedNotInvoiced: notInvoiced.length,
    completedNotInvoicedValue: notInvoiced.reduce((s, j) => s + j.labor_hours * SUMMIT.laborRate + j.parts_total, 0),
    lowInventory: d.parts.filter(p => p.quantity <= p.low_stock_threshold).length,
    repairCasesToday: d.repairCases.length,
    stuckJobs: d.jobCards.filter(j => j.status !== 'Completed' && j.check_in_date < utcMidnight(2)).length,
    highPriorityJobs: d.jobCards.filter(j => j.priority === 'High').length,
  };
}
