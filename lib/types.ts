export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
}

export interface Customer {
  id: string;
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
  tags: string[];
  followUp: string;
  portalToken: string | null;
}

export interface Vehicle {
  customerId: string;
  vin: string;
  label: string;
  trim: string;
  engine: string;
  transmission: string;
  mileage: string;
  plate: string;
  status: string;
  recommendation: string;
}

export interface JobCard {
  id: string;
  ro: string | null;
  invoice: string | null;
  customer: string;
  vehicle: string;
  serviceType: string;
  channel: string;
  location: string;
  technician: string;
  status: string;
  priority: string;
  approval: string;
  laborHours: number;
  partsTotal: number;
  workflow: string[];
  nextAction: string;
}

export interface RepairOrder {
  ro: string;
  jobCard: string;
  customer: string;
  vehicle: string;
  concern: string;
  cause: string;
  correction: string;
  tech: string;
  status: string;
  approval: string;
  total: number;
}

export type AppointmentRow = [string, string, string, string, string, string, string, string?];

export interface InvoiceLine {
  0: string;
  1: number;
  2: number;
  length: 3;
}

export interface Invoice {
  number: string;
  jobCard: string;
  customer: string;
  vehicle: string;
  status: string;
  lines: [string, number, number][];
  discount: number;
  shopSupplies: number;
  taxRate: number;
}

export interface InvoiceTotals {
  subtotal: number;
  discount: number;
  shopSupplies: number;
  tax: number;
  total: number;
}

export interface Message {
  id: string;
  customer: string;
  channel: string;
  subject: string;
  status: string;
  body: string;
}

export interface Inspection {
  id: string;
  jobCard: string;
  vehicle: string;
  technician: string;
  status: string;
  items: [string, string][];
}

export interface Estimate {
  id: string;
  jobCard: string;
  customer: string;
  vehicle: string;
  status: string;
  total: number;
  lines: string[];
}

export interface TechnicianTask {
  id: string;
  jobCard: string;
  technician: string;
  task: string;
  status: string;
  time: string;
}

export interface Payment {
  id: string;
  invoice: string;
  customer: string;
  amount: number;
  method: string;
  status: string;
  date: string;
}

export interface AuditLog {
  action: string;
  user: string;
  entity: string;
  time: string;
}

export interface Part {
  partNumber: string;
  brand: string;
  description: string;
  category: string;
  cost: number;
  retail: number;
  quantity: number;
  supplier: string;
  supplierPhone: string;
  supplierEmail: string;
  location: string;
  lowStockThreshold: number;
  reorderQty: number;
  compatibility: string;
  barcode: string;
  photos: string[];
  notes: string;
}

export interface VinResult {
  vin: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  engine: string;
  transmission: string;
  bodyStyle: string;
  manufacturer: string;
  countryOfOrigin: string;
  vehicleType: string;
}

export interface DtcResult {
  code: string;
  category: string;
  description: string;
  causes: string[];
  steps: string[];
  severity: string;
  recommendation: string;
}

export interface Plan {
  price: string;
  limits: {
    users: number;
    locations: number;
    customers: number;
    vehicles: number;
    jobs: number;
    invoices: number;
    aiCredits: number;
  };
  features: string[];
}

export interface AiInsight {
  area: string;
  recommendation: string;
  impact: string;
}

export interface AppState {
  activeModule: string;
  selectedInvoice: string;
  currentUserId: string;
  currentPlan: string;
  scanStatus: string;
  vinResult: VinResult | null;
  dtcResult: DtcResult | null;
  diagnosticCodes: string[];
  toast: string;
  activityLog: string[];
  users: User[];
  customers: Customer[];
  vehicles: Vehicle[];
  jobCards: JobCard[];
  repairOrders: RepairOrder[];
  appointments: AppointmentRow[];
  invoices: Invoice[];
  messages: Message[];
  inspections: Inspection[];
  estimates: Estimate[];
  technicianTasks: TechnicianTask[];
  payments: Payment[];
  auditLogs: AuditLog[];
  parts: Part[];
  openNewJobCard: boolean;
  prefill: { customerName?: string; customerId?: string; vehicle?: string; vin?: string; inspectionId?: string; jobCardId?: string; notes?: string } | null;
}

export type AppAction =
  | { type: 'SET_MODULE'; module: string }
  | { type: 'OPEN_NEW_JOB_CARD'; prefill?: { customerName?: string; customerId?: string; vehicle?: string; notes?: string } }
  | { type: 'CLOSE_NEW_JOB_CARD' }
  | { type: 'SET_PREFILL'; prefill: AppState['prefill'] }
  | { type: 'CLEAR_PREFILL' }
  | { type: 'NOTIFY'; message: string }
  | { type: 'LOGIN'; userId: string }
  | { type: 'RESET_PASSWORD' }
  | { type: 'LOGOUT' }
  | { type: 'INVITE_USER'; name: string; email: string; role: string }
  | { type: 'CHANGE_ROLE'; userId: string; role: string }
  | { type: 'TOGGLE_USER_STATUS'; userId: string }
  | { type: 'APPLY_PLAN'; plan: string }
  | { type: 'RECORD_PAYMENT'; invoiceNumber: string; amount: number; method: string }
  | { type: 'CREATE_JOB_CARD'; customer: string; workType: string; priority: string; route: string; location: string; technician: string; approvalCode: string }
  | { type: 'APPROVE_JOB'; jobId: string }
  | { type: 'CONVERT_JOB_TO_RO'; jobId: string }
  | { type: 'CREATE_INVOICE_FROM_JOB'; jobId: string }
  | { type: 'MARK_INVOICE_PAID'; invoiceNumber: string }
  | { type: 'SEND_INVOICE'; invoiceNumber: string }
  | { type: 'VIEW_INVOICE'; invoiceNumber: string }
  | { type: 'INVOICE_ACTION'; action: string; invoiceNumber: string }
  | { type: 'RESERVE_PART'; partNumber: string }
  | { type: 'SEND_FOLLOWUP'; customerId: string }
  | { type: 'CREATE_JOB_FROM_VEHICLE'; vehicleIndex: number }
  | { type: 'ADD_APPOINTMENT'; appointment: AppointmentRow }
  | { type: 'EDIT_APPOINTMENT'; appointmentIndex: number; appointment: AppointmentRow }
  | { type: 'DELETE_APPOINTMENT'; appointmentIndex: number }
  | { type: 'CHECK_IN'; appointmentIndex: number }
  | { type: 'SEND_REMINDER'; appointmentIndex: number }
  | { type: 'COMPLETE_INSPECTION'; inspectionId: string }
  | { type: 'CREATE_ESTIMATE_FROM_INSPECTION'; inspectionId: string }
  | { type: 'SEND_MESSAGE'; messageId: string }
  | { type: 'APPROVE_ESTIMATE'; estimateId: string }
  | { type: 'DECLINE_ESTIMATE'; estimateId: string }
  | { type: 'ESTIMATE_TO_INVOICE'; estimateId: string }
  | { type: 'START_TASK'; taskId: string }
  | { type: 'COMPLETE_TASK'; taskId: string }
  | { type: 'EXPORT_REPORT'; reportName: string }
  | { type: 'SAVE_SETTINGS' }
  | { type: 'SEND_AI_DRAFT' }
  | { type: 'ATTACH_AI_NOTE' }
  | { type: 'DECODE_VIN'; result: VinResult }
  | { type: 'LOOKUP_DTC'; result: DtcResult }
  | { type: 'SET_SCAN_STATUS'; status: string }
  | { type: 'READ_CODES'; codes: string[] }
  | { type: 'CLEAR_CODES' }
  | { type: 'SAVE_DIAGNOSTIC' };
