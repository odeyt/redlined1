import type { User, Customer, Vehicle, JobCard, RepairOrder, AppointmentRow, Invoice, Message, Inspection, Estimate, TechnicianTask, Payment, AuditLog, Plan, AiInsight } from './types';
import { initialPartsInventory } from '@/services/partsInventoryService';

export { initialPartsInventory };

export const initialUsers: User[] = [
  { id: 'U-1', name: 'Sam Owner', email: 'owner@redlined1.example', role: 'Owner', status: 'Active', lastLogin: 'Today' },
  { id: 'U-2', name: 'Avery Advisor', email: 'advisor@redlined1.example', role: 'Service Advisor', status: 'Active', lastLogin: 'Today' },
  { id: 'U-3', name: 'Priya Shah', email: 'priya@redlined1.example', role: 'Technician', status: 'Active', lastLogin: 'Yesterday' },
  { id: 'U-4', name: 'Morgan Parts', email: 'parts@redlined1.example', role: 'Parts Manager', status: 'Invited', lastLogin: 'Never' },
];

export const planCatalog: Record<string, Plan> = {
  Free: {
    price: '$0',
    limits: { users: 1, locations: 1, customers: 10, vehicles: 10, jobs: 10, invoices: 10, aiCredits: 0 },
    features: ['Basic CRM', 'Basic invoices', 'Vehicle history', 'Job cards', 'Email support'],
  },
  Pro: {
    price: '$29.99/mo',
    limits: { users: 5, locations: 1, customers: 1000, vehicles: 2000, jobs: 500, invoices: 500, aiCredits: 0 },
    features: ['Invoicing & Estimates', 'Digital Inspections', 'Parts Inventory', 'Appointments & Maintenance Schedules', 'SMS & Email Reminders', 'Time Tracking', 'Payment Collection', 'Reporting & Analytics'],
  },
  'Pro Plus': {
    price: '$49.99/mo',
    limits: { users: 20, locations: 3, customers: 999999, vehicles: 999999, jobs: 999999, invoices: 999999, aiCredits: 3000 },
    features: ['Everything in Pro', '3,000 AI Credits/mo', 'Image Attachments', 'Priority Support', 'Multi-user Access', 'Advanced Permissions', 'Dedicated Onboarding'],
  },
  'Pro Trial': {
    price: 'Trial',
    limits: { users: 20, locations: 3, customers: 999999, vehicles: 999999, jobs: 999999, invoices: 999999, aiCredits: 3000 },
    features: ['Full Pro Plus access for 7 days'],
  },
};

export const initialCustomers: Customer[] = [
  { id: 'C-1042', name: 'Northline Fleet Services', type: 'Fleet', phone: '(555) 013-4881', email: 'ops@northline.example', address: '2100 Harbor Industrial Pkwy', tags: ['Priority', 'Net 30'], followUp: 'Brake invoice ready for payment', portalToken: null },
  { id: 'C-1088', name: 'Maya Rodriguez', type: 'Retail', phone: '(555) 014-2990', email: 'maya.r@example.com', address: '84 Briar Lane', tags: ['Mobile', 'SMS OK'], followUp: 'Approve 60k mobile service estimate', portalToken: null },
  { id: 'C-1170', name: 'Westside Auto Group', type: 'Dealer', phone: '(555) 018-0033', email: 'parts@westside.example', address: '700 Market Street', tags: ['Wholesale', 'Multi-location'], followUp: 'Diagnostic estimate review', portalToken: null },
  { id: 'C-1194', name: 'Apex Logistics Group', type: 'Enterprise Fleet', phone: '(555) 017-8220', email: 'fleet@apex.example', address: '8 regional depots', tags: ['National', 'PO Required'], followUp: 'Quarterly SLA report due', portalToken: null },
];

export const initialVehicles: Vehicle[] = [
  { customerId: 'C-1042', vin: '1FTFW1E85PFA24680', label: '2023 Ford F-150 XL', trim: 'SuperCrew 4WD', engine: '3.5L EcoBoost', transmission: '10-speed automatic', mileage: '48,221', plate: 'FLT-2048', status: 'Open Job', recommendation: 'Front pads and rotors' },
  { customerId: 'C-1088', vin: '2T3P1RFV7MW123456', label: '2021 Toyota RAV4 XLE', trim: 'AWD', engine: '2.5L I4', transmission: '8-speed automatic', mileage: '61,004', plate: 'MRA-418', status: 'Mobile Dispatch', recommendation: '60k service package' },
  { customerId: 'C-1170', vin: 'WBA5R1C05LFH11223', label: '2020 BMW 330i', trim: 'Sport Line', engine: '2.0L turbo', transmission: '8-speed automatic', mileage: '37,900', plate: 'DLR-330', status: 'Diagnostic', recommendation: 'DTC P0420 inspection' },
];

export const initialJobCards: JobCard[] = [
  {
    id: 'JC-3108', ro: 'RO-24019', invoice: 'INV-10091', customer: 'Northline Fleet Services', vehicle: '2023 Ford F-150',
    serviceType: 'Fleet brake service', channel: 'Shop bay', location: 'Downtown Branch / Bay 2', technician: 'Jordan Lee',
    status: 'Ready to Invoice', priority: 'High', approval: 'Approved', laborHours: 2.1, partsTotal: 365.5,
    workflow: ['Booked', 'Inspected', 'Approved', 'Parts Picked', 'Work Complete', 'Invoice Created'],
    nextAction: 'Collect payment or post to fleet account',
  },
  {
    id: 'JC-3109', ro: 'RO-24020', invoice: 'INV-10092', customer: 'Maya Rodriguez', vehicle: '2021 Toyota RAV4',
    serviceType: '60k maintenance', channel: 'Mobile mechanic', location: 'Customer driveway - 84 Briar Lane', technician: 'Priya Shah',
    status: 'Awaiting Approval', priority: 'Normal', approval: 'Pending', laborHours: 1.7, partsTotal: 112.45,
    workflow: ['Booked', 'Dispatched', 'Inspection Sent', 'Awaiting Approval'],
    nextAction: 'Customer approval by SMS',
  },
  {
    id: 'JC-3110', ro: 'RO-24021', invoice: null, customer: 'Westside Auto Group', vehicle: '2020 BMW 330i',
    serviceType: 'Check engine diagnostic', channel: 'Dealer wholesale', location: 'North Branch / Diagnostic Bay', technician: 'Alex Kim',
    status: 'Diagnostic', priority: 'Normal', approval: 'Internal', laborHours: 1.2, partsTotal: 0,
    workflow: ['Booked', 'Checked In', 'Scan Tool Connected', 'DTC Report Saved'],
    nextAction: 'Convert diagnostic findings to estimate',
  },
];

export const initialRepairOrders: RepairOrder[] = [
  { ro: 'RO-24019', jobCard: 'JC-3108', customer: 'Northline Fleet Services', vehicle: '2023 Ford F-150', concern: 'Brake noise and vibration', cause: 'Front rotors below spec, pads glazed', correction: 'Replace front pads and rotors, road test', tech: 'Jordan Lee', status: 'Waiting on Parts', approval: 'Approved', total: 842.5 },
  { ro: 'RO-24020', jobCard: 'JC-3109', customer: 'Maya Rodriguez', vehicle: '2021 Toyota RAV4', concern: 'Maintenance service', cause: 'Scheduled 60k interval', correction: 'Oil, filters, inspection, tire rotation', tech: 'Priya Shah', status: 'Scheduled', approval: 'Pending', total: 389.95 },
  { ro: 'RO-24021', jobCard: 'JC-3110', customer: 'Westside Auto Group', vehicle: '2020 BMW 330i', concern: 'Check engine light', cause: 'Catalyst efficiency fault stored', correction: 'Perform smoke test and oxygen sensor graphing', tech: 'Alex Kim', status: 'In Progress', approval: 'Internal', total: 210 },
];

export const initialAppointments: AppointmentRow[] = [];

export const initialInvoices: Invoice[] = [
  {
    number: 'INV-10091', jobCard: 'JC-3108', customer: 'Northline Fleet Services', vehicle: '2023 Ford F-150', status: 'Unpaid',
    lines: [['Front brake labor', 2.1, 145], ['Brake pads premium', 1, 129.5], ['Front rotors', 2, 118]],
    discount: 25, shopSupplies: 19.5, taxRate: 0.0825,
  },
  {
    number: 'INV-10092', jobCard: 'JC-3109', customer: 'Maya Rodriguez', vehicle: '2021 Toyota RAV4', status: 'Draft',
    lines: [['60k mobile service labor', 1.7, 145], ['Synthetic oil kit', 1, 72.5], ['Cabin air filter', 1, 39.95], ['Mobile service call', 1, 65]],
    discount: 0, shopSupplies: 12, taxRate: 0.0825,
  },
];

export const initialMessages: Message[] = [
  { id: 'MSG-1', customer: 'Maya Rodriguez', channel: 'SMS', subject: 'Estimate approval', status: 'Draft', body: 'Your 60k mobile service estimate is ready for approval.' },
  { id: 'MSG-2', customer: 'Northline Fleet Services', channel: 'Email', subject: 'Invoice payment link', status: 'Queued', body: 'Invoice INV-10091 is ready with fleet account terms.' },
  { id: 'MSG-3', customer: 'Westside Auto Group', channel: 'Email', subject: 'Diagnostic findings', status: 'Sent', body: 'P0420 diagnostic summary attached to JC-3110.' },
];

export const initialInspections: Inspection[] = [
  { id: 'DI-2201', jobCard: 'JC-3109', vehicle: '2021 Toyota RAV4', technician: 'Priya Shah', status: 'In Progress', items: [['Tires', 'Pass'], ['Brakes', 'Attention'], ['Fluids', 'Pass'], ['Battery', 'Pass'], ['Photos', '2 attached']] },
  { id: 'DI-2202', jobCard: 'JC-3110', vehicle: '2020 BMW 330i', technician: 'Alex Kim', status: 'Review', items: [['MIL / CEL', 'Fail'], ['Exhaust leak check', 'Attention'], ['O2 graph', 'Pending'], ['Freeze frame', 'Captured']] },
];

export const initialEstimates: Estimate[] = [
  { id: 'EST-5007', jobCard: 'JC-3109', customer: 'Maya Rodriguez', vehicle: '2021 Toyota RAV4', status: 'Pending Approval', total: 389.95, lines: ['60k mobile service', 'Synthetic oil kit', 'Cabin air filter', 'Mobile service call'] },
  { id: 'EST-5008', jobCard: 'JC-3110', customer: 'Westside Auto Group', vehicle: '2020 BMW 330i', status: 'Draft', total: 210, lines: ['Diagnostic labor', 'O2 sensor graphing', 'Smoke test'] },
];

export const initialTechnicianTasks: TechnicianTask[] = [
  { id: 'TASK-80', jobCard: 'JC-3108', technician: 'Jordan Lee', task: 'Install front brake pads and rotors', status: 'Assigned', time: '2.1h' },
  { id: 'TASK-81', jobCard: 'JC-3109', technician: 'Priya Shah', task: 'Perform 60k mobile service', status: 'Waiting Approval', time: '1.7h' },
  { id: 'TASK-82', jobCard: 'JC-3110', technician: 'Alex Kim', task: 'Complete P0420 diagnostic workflow', status: 'In Progress', time: '1.2h' },
];

export const initialPayments: Payment[] = [
  { id: 'PAY-7001', invoice: 'INV-10092', customer: 'Maya Rodriguez', amount: 491.94, method: 'Manual card', status: 'Recorded', date: 'Today' },
];

export const initialAuditLogs: AuditLog[] = [
  { action: 'User login', user: 'Sam Owner', entity: 'Session', time: 'Today' },
  { action: 'Plan enabled', user: 'Sam Owner', entity: 'Pro Trial', time: 'Today' },
  { action: 'Invoice linked', user: 'System', entity: 'INV-10091', time: 'Today' },
];

export const reports: [string, string, string][] = [
  ['Revenue', '$48,620', '+11.8% vs last month'],
  ['Outstanding invoices', '$9,430', '14 invoices pending'],
  ['Job cycle time', '1.8 days', 'Booked to paid'],
  ['Mobile route revenue', '$7,880', '6 jobs this week'],
  ['Technician productivity', '86%', 'Target 82%'],
  ['Fleet retention', '93%', '6 active fleet accounts'],
];

export const aiInsights: AiInsight[] = [
  { area: 'Job triage', recommendation: 'Move JC-3109 to the first mobile route stop because parts are in stock and approval is one SMS away.', impact: 'Reduces same-day route idle time' },
  { area: 'Invoice review', recommendation: 'INV-10091 has labor, parts, shop supplies, and fleet terms captured. Add PO before sending.', impact: 'Prevents enterprise payment delay' },
  { area: 'Diagnostic assist', recommendation: 'P0420 on JC-3110 should include oxygen sensor graphing and exhaust leak inspection before catalyst quote.', impact: 'Improves first-time authorization' },
  { area: 'Customer follow-up', recommendation: 'Send Maya Rodriguez a short approval message with mobile ETA, total estimate, and payment link.', impact: 'Improves approval conversion' },
];

// The fourth element was a badge count. Every value was invented demo data —
// '138' customers, '312' vehicles, '486' parts — and the sidebar fell back to
// it whenever a module had no real count, so a brand-new shop with no records
// displayed a busy workspace, and established shops saw totals that
// contradicted the page behind the link.
//
// All are now empty and the sidebar ignores this slot entirely: it renders a
// badge only for counts it actually loaded. The slot is kept so the tuple type
// and every existing destructure stay valid.
export const navItems: [string, string, string, string][] = [
  // ── Overview
  ['dashboard',        'dashboard',  'Dashboard',        ''],
  ['command-center',   'activity',   'Command Center',   ''],

  // ── Intake
  ['triage',        'clipboard',  'Vehicle Intake', ''],
  ['customers',     'customers',  'Customers',     ''],
  ['vehicles',      'vehicle',    'Vehicles',      ''],
  ['appointments',  'calendar',   'Appointments',  ''],

  // ── Job & Dispatch
  ['job-cards',     'clipboard',  'Job Cards',     ''],
  ['job-archive',   'clipboard',  'Job Archive',   ''],
  ['time-tracking', 'clock',      'Time Tracking', ''],
  ['scheduling',    'calendar',   'Maintenance Schedules', ''],

  // ── Inspection & Estimate
  ['inspections',   'inspection', 'Inspections',   ''],
  ['estimates',     'estimate',   'Estimates',     ''],

  // ── Repair
  ['repair-orders', 'wrench',     'Repair Orders', ''],
  ['technicians',   'technician', 'Employees',     ''],
  ['attendance',    'clock',      'Attendance & Leave', ''],
  ['pay',           'payment',    'Pay & Advances', ''],
  ['payroll',       'payment',    'Payroll',       ''],
  ['expenses',      'payment',    'Expenses',      ''],
  ['parts',         'parts',      'Parts Inventory', ''],
  ['parts-estimates', 'parts',    'Parts Quotations', ''],
  ['parts-orders',   'parts',      'Parts Ordered',  ''],
  ['parts-received', 'parts',      'Parts Received', ''],

  // ── Billing
  ['invoices',      'invoice',    'Invoicing',     ''],
  ['payments',      'payment',    'Payments',      ''],

  // ── Communication
  ['communication', 'message',    'Communication', ''],

  // ── Diagnostics & Tools
  ['vin',           'vin',        'VIN Decode',    ''],
  ['dtc',           'warning',    'DTC Lookup',    ''],
  ['diagnostics',   'scan',       'Diagnostics',   ''],
  ['ai',            'ai',         'AI Copilot',    ''],
  ['repair-intelligence', 'wrench', 'Repair Intelligence', ''],

  // ── Reports & Admin
  ['reports',       'chart',      'Reports',       ''],
  ['labor-guide',   'chart',      'Labor Guide',   ''],
  ['access',        'userkey',    'Login & Roles', ''],
  ['billing',       'payment',    'Billing & Subscription', ''],
  ['subscriptions', 'shield',     'Plans & Gates', ''],
  ['settings',      'settings',   'Settings',      ''],
  ['system-health',       'activity',  'System Health',     ''],
  ['disaster-recovery',   'lifeline',  'Disaster Recovery', ''],
  ['testing-dashboard',   'flask',     'Testing Dashboard', ''],
  ['support-inbox',       'message',   'Support Inbox',     ''],
];

/**
 * What the Billing module is called depends on whether the shop is paying.
 *
 * "Billing & Subscription" reads as something still to be arranged. Once a
 * shop is subscribed the screen is where they manage what they already have —
 * plan, payment method, invoices — so it is their account.
 *
 * One function for both the sidebar and the page header, so the two cannot
 * drift into calling the same screen different things.
 */
export function billingLabel(planStatus: string): string {
  return planStatus === 'pro' ? 'Account' : 'Billing & Subscription';
}

export function billingTitle(planStatus: string): [string, string] {
  return planStatus === 'pro'
    ? ['Account', 'Your plan, payment method, billing history, and what is included']
    : ['Billing & Subscription', 'Choose a plan, add a payment method, and see what each plan includes'];
}

export const moduleTitles: Record<string, [string, string]> = {
  triage: ['Vehicle Intake', 'Capture high-quality customer complaints before creating a job card — structured intake with inspection suggestions'],
  dashboard: ['Operations Dashboard', 'Live view of job cards, repair orders, invoices, parts, and diagnostics'],
  access: ['Login and Role Control', 'User authentication, invitations, sessions, roles, and staff permissions'],
  'labor-guide': ['Historical Labor Rate Guide', 'Self-learning flat-rate standards built from your shop history — owner only'],
  'repair-intelligence': ['Repair Intelligence', 'Knowledge base of verified repair cases — search, verify, and learn from past repairs'],
  subscriptions: ['Subscriptions and Feature Gates', 'Free plan restrictions, paid subscriber controls, limits, and upgrade path'],
  ai: ['AI Copilot', 'Artificial intelligence for estimates, diagnostics, invoices, routing, and customer follow-up'],
  customers: ['Customer CRM', 'Customer accounts, communications, reminders, vehicles, and history'],
  vehicles: ['Vehicle Management', 'VIN, mileage, drivetrain, service history, diagnostics, and recommendations'],
  'job-cards': ['Job Cards', 'Dispatch, inspect, approve, complete, and invoice every service job'],
  'job-archive': ['Job Archive', 'Permanent record of all completed, closed, and invoiced jobs — search, filter by period, export'],
  scheduling: ['Maintenance Schedules', 'Recurring service intervals, fleet schedules, due-soon alerts, and overdue tracking'],
  inspections: ['Digital Vehicle Inspections', 'Pass/Attention/Fail checklists, photos, customer approvals, and shareable reports'],
  communication: ['Customer Communication', 'SMS, email, approvals, payment links, reminders, and follow-up history'],
  estimates: ['Estimates', 'Build, approve, decline, and convert estimates into repair orders and invoices'],
  'repair-orders': ['Repair Orders', 'Complaint, cause, correction, labor, parts, approvals, and workflow'],
  invoices: ['Invoicing', 'Invoices generated from approved job cards, labor, parts, diagnostics, and fees'],
  payments: ['Payments', 'Manual payment recording, balances, paid status, and future Stripe-ready workflow'],
  parts: ['Parts Inventory', 'Inventory, suppliers, bin locations, margins, and parts sales'],
  'parts-orders': ['Parts Orders', 'Source, track, receive, and reconcile parts ordered from vendors'],
  'parts-received': ['Parts Received', 'All received parts orders — verify, reconcile, and manage payment balances'],
  'parts-estimates': ['Parts Quotations', 'Parts quoted to customers pending approval — track, follow up, and convert to orders'],
  technicians: ['Technician Workflow', 'Assigned work, labor time, inspection findings, diagnostics, and completion status'],
  vin: ['VIN Decoder', 'Mock VIN decode flow structured for future provider integration'],
  dtc: ['DTC Lookup', 'Diagnostic trouble code knowledge base and service guidance'],
  diagnostics: ['Scan Tool Interface', 'Simulated OBD-II session designed for future hardware integration'],
  appointments: ['Appointments', 'Daily booking list, check-in, bay/route assignment, technician, and reminder status'],
  reports: ['Reports', 'Revenue, inventory, productivity, diagnostics, retention, and job cycle reporting'],
  settings: ['Settings', 'Shop profile, mobile operations, branches, roles, numbering, and integration placeholders'],
};
