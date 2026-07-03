import { z } from 'zod/v4';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const nonEmpty = (field: string) =>
  z.string().min(1, `${field} is required`);

const optionalStr = z.string().optional().default('');

const phoneRegex = /^[+\d\s\-().]{7,20}$/;

// ─── Customer ─────────────────────────────────────────────────────────────────

export const customerSchema = z.object({
  name: nonEmpty('Name').max(120, 'Name too long'),
  phone: z.string().regex(phoneRegex, 'Invalid phone number').optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: optionalStr,
  notes: optionalStr,
  tags: z.array(z.string()).optional().default([]),
});

export type CustomerInput = z.infer<typeof customerSchema>;

// ─── Vehicle ──────────────────────────────────────────────────────────────────

export const vehicleSchema = z.object({
  label: nonEmpty('Vehicle label').max(120, 'Label too long'),
  vin: z.string().max(17, 'VIN must be 17 characters').optional().or(z.literal('')),
  plate: optionalStr,
  trim: optionalStr,
  engine: optionalStr,
  transmission: optionalStr,
  mileage: z.coerce.number().min(0, 'Mileage cannot be negative').optional(),
  customerId: z.string().optional().or(z.literal('')),
});

export type VehicleInput = z.infer<typeof vehicleSchema>;

// ─── Job Card ─────────────────────────────────────────────────────────────────

const JOB_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'] as const;
const JOB_STATUSES = ['Booked', 'Checked In', 'Approved', 'In Progress', 'Pending Parts', 'Complete', 'Closed'] as const;

export const jobCardSchema = z.object({
  customer: nonEmpty('Customer name'),
  vehicle: nonEmpty('Vehicle'),
  serviceType: nonEmpty('Service type'),
  priority: z.enum(JOB_PRIORITIES).default('Normal'),
  status: z.enum(JOB_STATUSES).default('Booked'),
  technicians: z.array(z.string()).optional().default([]),
  notes: optionalStr,
  laborHours: z.coerce.number().min(0).optional(),
  partsTotal: z.coerce.number().min(0).optional(),
});

export type JobCardInput = z.infer<typeof jobCardSchema>;

// ─── Repair Order ─────────────────────────────────────────────────────────────

const RO_STATUSES = ['Open', 'In Progress', 'Pending Parts', 'Pending Approval', 'Complete', 'Closed', 'Void'] as const;

export const repairOrderSchema = z.object({
  customerName: nonEmpty('Customer name'),
  vehicle: nonEmpty('Vehicle'),
  concern: nonEmpty('Customer concern'),
  cause: optionalStr,
  correction: optionalStr,
  status: z.enum(RO_STATUSES).default('Open'),
  technician: optionalStr,
  laborHours: z.coerce.number().min(0).optional(),
  laborRate: z.coerce.number().min(0).optional(),
  notes: optionalStr,
});

export type RepairOrderInput = z.infer<typeof repairOrderSchema>;

// ─── Estimate ─────────────────────────────────────────────────────────────────

export const estimateLineSchema = z.object({
  description: z.string().min(1, 'Description required'),
  laoDescription: optionalStr,
  qty: z.coerce.number().min(0),
  cost: z.coerce.number(),
  markup: z.coerce.number().min(0).max(500),
  rate: z.coerce.number(),
  currency: optionalStr,
  note: optionalStr,
});

export const estimateSchema = z.object({
  customerName: nonEmpty('Customer name'),
  vehicle: nonEmpty('Vehicle'),
  currency: z.string().min(1, 'Currency is required'),
  lines: z.array(estimateLineSchema).min(1, 'At least one line item is required'),
  notes: optionalStr,
});

export type EstimateInput = z.infer<typeof estimateSchema>;

// ─── Invoice ──────────────────────────────────────────────────────────────────

export const invoiceLineSchema = z.object({
  description: z.string().min(1, 'Description required'),
  laoDescription: optionalStr,
  note: optionalStr,
  qty: z.coerce.number().min(0),
  cost: z.coerce.number(),
  markup: z.coerce.number().min(0).max(500),
  rate: z.coerce.number(),
  currency: optionalStr,
});

export const invoiceSchema = z.object({
  customerName: nonEmpty('Customer name'),
  vehicle: nonEmpty('Vehicle'),
  currency: z.string().min(1, 'Currency is required'),
  status: z.string().default('Draft'),
  lines: z.array(invoiceLineSchema).min(1, 'At least one line item is required'),
  discount: z.coerce.number().min(0).default(0),
  shopSupplies: z.coerce.number().min(0).default(0),
  notes: optionalStr,
  dueDate: optionalStr,
});

export type InvoiceInput = z.infer<typeof invoiceSchema>;

// ─── Payment ──────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = ['Cash', 'Card', 'Check', 'Transfer', 'Invoice Link', 'Other'] as const;
const PAYMENT_STATUSES = ['Recorded', 'Reconciled', 'Voided'] as const;

export const paymentSchema = z.object({
  invoiceNumber: nonEmpty('Invoice number'),
  customerName: nonEmpty('Customer name'),
  amount: z.coerce.number().positive('Amount must be positive'),
  method: z.enum(PAYMENT_METHODS).default('Cash'),
  status: z.enum(PAYMENT_STATUSES).default('Recorded'),
  currency: z.string().min(1, 'Currency is required'),
  paymentDate: z.string().min(1, 'Payment date is required'),
  notes: optionalStr,
});

export type PaymentInput = z.infer<typeof paymentSchema>;

// ─── Technician ───────────────────────────────────────────────────────────────

const TECH_PAY_TYPES = ['Hourly', 'Flat Rate', 'Salary'] as const;
const TECH_STATUSES = ['Active', 'Inactive'] as const;

export const technicianSchema = z.object({
  name: nonEmpty('Name').max(100, 'Name too long'),
  role: optionalStr,
  specialty: optionalStr,
  phone: z.string().regex(phoneRegex, 'Invalid phone number').optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  payType: z.enum(TECH_PAY_TYPES).default('Hourly'),
  payRate: z.coerce.number().min(0).optional(),
  status: z.enum(TECH_STATUSES).default('Active'),
  notes: optionalStr,
});

export type TechnicianInput = z.infer<typeof technicianSchema>;

// ─── Part ─────────────────────────────────────────────────────────────────────

export const partSchema = z.object({
  partNumber: nonEmpty('Part number').max(80),
  description: nonEmpty('Description').max(200),
  brand: optionalStr,
  category: optionalStr,
  cost: z.coerce.number().min(0).default(0),
  retail: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().min(0).default(0),
  lowStockThreshold: z.coerce.number().min(0).default(0),
  supplier: optionalStr,
  location: optionalStr,
  notes: optionalStr,
});

export type PartInput = z.infer<typeof partSchema>;

// ─── Appointment ──────────────────────────────────────────────────────────────

const APPT_STATUSES = ['Booked', 'Confirmed', 'Checked In', 'Completed', 'Cancelled', 'No Show'] as const;

export const appointmentSchema = z.object({
  customerName: nonEmpty('Customer name'),
  vehicle: nonEmpty('Vehicle'),
  serviceType: nonEmpty('Service type'),
  dateTime: z.string().min(1, 'Date and time is required'),
  status: z.enum(APPT_STATUSES).default('Booked'),
  notes: optionalStr,
  technicianId: optionalStr,
  jobCardId: optionalStr,
});

export type AppointmentInput = z.infer<typeof appointmentSchema>;

// ─── AI Request ───────────────────────────────────────────────────────────────

export const AI_TASK_TYPES = [
  'dtc_explanation',
  'estimate_draft',
  'customer_message',
  'invoice_summary',
  'repair_case_summary',
] as const;

export const aiRequestSchema = z.object({
  type: z.enum(AI_TASK_TYPES),
  context: z.record(z.string(), z.unknown()),
  shopId: z.string().optional(),
});

export type AiRequestInput = z.infer<typeof aiRequestSchema>;

// ─── Validation helper ────────────────────────────────────────────────────────

export type ValidationErrors = Record<string, string>;

export function extractErrors(error: z.ZodError): ValidationErrors {
  const out: ValidationErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    out[key] = issue.message;
  }
  return out;
}
