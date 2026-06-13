'use client';

import { createContext, useContext, useReducer, ReactNode } from 'react';
import type { AppState, AppAction, JobCard, RepairOrder, Invoice } from './types';
import {
  initialUsers, initialCustomers, initialVehicles, initialJobCards,
  initialRepairOrders, initialAppointments, initialInvoices, initialMessages,
  initialInspections, initialEstimates, initialTechnicianTasks, initialPayments,
  initialAuditLogs, initialPartsInventory,
} from './mock-data';
function calculateInvoice(i: { subtotal?: number; discount?: number; tax?: number; shop_supplies?: number }) {
  return { total: (i.subtotal ?? 0) - (i.discount ?? 0) + (i.tax ?? 0) + (i.shop_supplies ?? 0) };
}

export const initialState: AppState = {
  activeModule: 'dashboard',
  openNewJobCard: false,
  selectedInvoice: 'INV-10091',
  currentUserId: 'U-1',
  currentPlan: 'Pro Trial',
  scanStatus: 'Disconnected',
  vinResult: null,
  dtcResult: null,
  diagnosticCodes: [],
  toast: 'Ready. Use the workflow buttons to create jobs, approve work, invoice, and save diagnostics.',
  activityLog: ['System ready', 'AI Copilot loaded', 'Invoice workflow linked to job cards'],
  users: initialUsers,
  customers: initialCustomers,
  vehicles: initialVehicles,
  jobCards: initialJobCards,
  repairOrders: initialRepairOrders,
  appointments: initialAppointments,
  invoices: initialInvoices,
  messages: initialMessages,
  inspections: initialInspections,
  estimates: initialEstimates,
  technicianTasks: initialTechnicianTasks,
  payments: initialPayments,
  auditLogs: initialAuditLogs,
  parts: initialPartsInventory,
};

function nextNumber(prefix: string, items: { [key: string]: unknown }[], field: string): string {
  const max = items.reduce((highest, item) => {
    const value = String(item[field] || '');
    if (!value.startsWith(prefix)) return highest;
    return Math.max(highest, Number(value.replace(prefix, '')) || 0);
  }, 0);
  return `${prefix}${max + 1}`;
}

function addWorkflowStep(job: JobCard, step: string): JobCard {
  if (job.workflow.includes(step)) return job;
  return { ...job, workflow: [...job.workflow, step] };
}

function addAudit(state: AppState, action: string, entity: string): AppState['auditLogs'] {
  const user = state.users.find(u => u.id === state.currentUserId) || state.users[0];
  return [{ action, user: user.name, entity, time: 'Just now' }, ...state.auditLogs];
}

function notify(state: AppState, message: string): Partial<AppState> {
  return { toast: message, activityLog: [message, ...state.activityLog].slice(0, 6) };
}

function customerVehicleFor(customer: string): string {
  if (customer.includes('Maya')) return '2021 Toyota RAV4';
  if (customer.includes('Northline')) return '2023 Ford F-150';
  if (customer.includes('Apex')) return 'Ford Transit 250';
  return 'Vehicle pending';
}

function ensureRo(state: AppState, jobId: string): AppState {
  const job = state.jobCards.find(j => j.id === jobId);
  if (!job || job.ro) return state;
  const roNumber = nextNumber('RO-', state.repairOrders as unknown as Record<string, unknown>[], 'ro');
  const newRo: RepairOrder = {
    ro: roNumber, jobCard: job.id, customer: job.customer, vehicle: job.vehicle,
    concern: job.serviceType, cause: 'Inspection findings pending',
    correction: 'Technician to complete workflow and record correction',
    tech: job.technician, status: 'In Progress', approval: job.approval,
    total: job.laborHours * 145 + job.partsTotal,
  };
  const updatedJob = addWorkflowStep({ ...job, ro: roNumber, status: 'In Progress', nextAction: 'Complete work and create invoice' }, 'Repair Order');
  return {
    ...state,
    repairOrders: [newRo, ...state.repairOrders],
    jobCards: state.jobCards.map(j => j.id === jobId ? updatedJob : j),
    ...notify(state, `${jobId} converted to ${roNumber}.`),
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_MODULE':
      return { ...state, activeModule: action.module };

    case 'OPEN_NEW_JOB_CARD':
      return { ...state, activeModule: 'job-cards', openNewJobCard: true };

    case 'CLOSE_NEW_JOB_CARD':
      return { ...state, openNewJobCard: false };

    case 'NOTIFY':
      return { ...state, ...notify(state, action.message) };

    case 'LOGIN': {
      const users = state.users.map(u => u.id === action.userId ? { ...u, lastLogin: 'Just now' } : u);
      const user = users.find(u => u.id === action.userId) || users[0];
      return {
        ...state, users, currentUserId: action.userId,
        auditLogs: addAudit(state, 'User login', user.email),
        ...notify(state, `${user.name} signed in as ${user.role}.`),
      };
    }

    case 'RESET_PASSWORD': {
      const user = state.users.find(u => u.id === state.currentUserId) || state.users[0];
      return { ...state, auditLogs: addAudit(state, 'Password reset requested', user.email), ...notify(state, `Password reset email queued for ${user.email}.`) };
    }

    case 'LOGOUT': {
      const user = state.users.find(u => u.id === state.currentUserId) || state.users[0];
      return { ...state, auditLogs: addAudit(state, 'User logout', user.email), ...notify(state, `${user.name} session ended in prototype.`) };
    }

    case 'INVITE_USER': {
      const newUser = { id: `U-${state.users.length + 1}`, name: action.name, email: action.email, role: action.role, status: 'Invited', lastLogin: 'Never' };
      return { ...state, users: [...state.users, newUser], auditLogs: addAudit(state, 'User invited', action.email), ...notify(state, `${action.name} invited as ${action.role}.`) };
    }

    case 'CHANGE_ROLE': {
      const users = state.users.map(u => u.id === action.userId ? { ...u, role: action.role } : u);
      const user = users.find(u => u.id === action.userId) || users[0];
      return { ...state, users, auditLogs: addAudit(state, 'Role changed', user.email), ...notify(state, `${user.name} role changed to ${action.role}.`) };
    }

    case 'TOGGLE_USER_STATUS': {
      const users = state.users.map(u => u.id === action.userId ? { ...u, status: u.status === 'Active' ? 'Inactive' : 'Active' } : u);
      const user = users.find(u => u.id === action.userId) || users[0];
      return { ...state, users, auditLogs: addAudit(state, 'User status changed', user.email), ...notify(state, `${user.name} is now ${user.status}.`) };
    }

    case 'APPLY_PLAN':
      return { ...state, currentPlan: action.plan, auditLogs: addAudit(state, 'Subscription changed', action.plan), ...notify(state, `Plan changed to ${action.plan}. Feature gates updated.`) };

    case 'RECORD_PAYMENT': {
      const invoice = state.invoices.find(i => i.number === action.invoiceNumber);
      const newPayment = { id: nextNumber('PAY-', state.payments as unknown as Record<string, unknown>[], 'id'), invoice: action.invoiceNumber, customer: invoice?.customer || 'Customer', amount: action.amount, method: action.method, status: 'Recorded', date: 'Today' };
      const invoices = state.invoices.map(i => {
        if (i.number !== action.invoiceNumber) return i;
        return { ...i, status: action.amount >= calculateInvoice(i).total ? 'Paid' : 'Partially Paid' };
      });
      return { ...state, invoices, payments: [newPayment, ...state.payments], auditLogs: addAudit(state, 'Payment recorded', action.invoiceNumber), ...notify(state, `$${action.amount.toFixed(2)} payment recorded for ${action.invoiceNumber}.`) };
    }

    case 'CREATE_JOB_CARD': {
      const id = nextNumber('JC-', state.jobCards as unknown as Record<string, unknown>[], 'id');
      const newJob: JobCard = {
        id, ro: null, invoice: null, customer: action.customer, vehicle: customerVehicleFor(action.customer),
        serviceType: action.workType,
        channel: action.workType.includes('Mobile') ? 'Mobile mechanic' : action.workType.includes('Fleet') ? 'Fleet service' : 'Shop bay',
        location: action.location, technician: action.technician,
        status: action.approvalCode ? 'Approved' : 'Booked',
        priority: action.priority, approval: action.approvalCode ? 'Approved' : 'Pending',
        laborHours: action.workType.includes('Diagnostic') ? 1.1 : 1.6,
        partsTotal: action.workType.includes('Diagnostic') ? 0 : 96.5,
        workflow: action.approvalCode ? ['Booked', 'Approved'] : ['Booked'],
        nextAction: action.approvalCode ? 'Convert to repair order' : 'Request approval',
      };
      const newAppt: [string, string, string, string, string, string, string] = ['Next', action.customer.split(' ')[0], newJob.vehicle, action.workType, id, action.route, 'Booked'];
      return { ...state, jobCards: [newJob, ...state.jobCards], appointments: [newAppt, ...state.appointments], activeModule: 'job-cards', ...notify(state, `${id} created for ${action.customer}.`) };
    }

    case 'APPROVE_JOB': {
      const jobCards = state.jobCards.map(j => {
        if (j.id !== action.jobId) return j;
        return addWorkflowStep({ ...j, status: 'Approved', approval: 'Approved', nextAction: 'Convert to repair order' }, 'Approved');
      });
      return { ...state, jobCards, ...notify(state, `${action.jobId} approved and ready for RO conversion.`) };
    }

    case 'CONVERT_JOB_TO_RO': {
      const newState = ensureRo(state, action.jobId);
      return { ...newState, activeModule: 'repair-orders' };
    }

    case 'CREATE_INVOICE_FROM_JOB': {
      let s = state;
      const job = s.jobCards.find(j => j.id === action.jobId);
      if (!job) return state;
      if (!job.ro) {
        s = ensureRo(s, action.jobId);
      }
      const refreshedJob = s.jobCards.find(j => j.id === action.jobId)!;
      if (refreshedJob.invoice) {
        return { ...s, selectedInvoice: refreshedJob.invoice, activeModule: 'invoices', ...notify(s, `${refreshedJob.invoice} is already linked to ${action.jobId}.`) };
      }
      const invoiceNumber = nextNumber('INV-', s.invoices as unknown as Record<string, unknown>[], 'number');
      const newInvoice: Invoice = {
        number: invoiceNumber, jobCard: refreshedJob.id, customer: refreshedJob.customer, vehicle: refreshedJob.vehicle, status: 'Draft',
        lines: [
          [`${refreshedJob.serviceType} labor`, refreshedJob.laborHours, 145],
          ['Parts and materials', 1, refreshedJob.partsTotal],
          [refreshedJob.channel.includes('Mobile') ? 'Mobile service call' : 'Shop supplies', 1, refreshedJob.channel.includes('Mobile') ? 65 : 18],
        ],
        discount: 0, shopSupplies: 12, taxRate: 0.0825,
      };
      const jobCards = s.jobCards.map(j => {
        if (j.id !== action.jobId) return j;
        return addWorkflowStep({ ...j, invoice: invoiceNumber, status: 'Ready to Invoice', nextAction: 'Send invoice' }, 'Invoice Created');
      });
      return { ...s, jobCards, invoices: [newInvoice, ...s.invoices], selectedInvoice: invoiceNumber, activeModule: 'invoices', ...notify(s, `${invoiceNumber} created from ${action.jobId}.`) };
    }

    case 'MARK_INVOICE_PAID': {
      const invoice = state.invoices.find(i => i.number === action.invoiceNumber);
      const invoices = state.invoices.map(i => i.number === action.invoiceNumber ? { ...i, status: 'Paid' } : i);
      const jobCards = state.jobCards.map(j => {
        if (j.invoice !== action.invoiceNumber) return j;
        return addWorkflowStep({ ...j, status: 'Paid', nextAction: 'Schedule follow-up' }, 'Paid');
      });
      const payments = state.payments.some(p => p.invoice === action.invoiceNumber)
        ? state.payments
        : [{ id: nextNumber('PAY-', state.payments as unknown as Record<string, unknown>[], 'id'), invoice: action.invoiceNumber, customer: invoice?.customer || 'Customer', amount: invoice ? calculateInvoice(invoice).total : 0, method: 'Manual', status: 'Recorded', date: 'Today' }, ...state.payments];
      return { ...state, invoices, jobCards, payments, auditLogs: addAudit(state, 'Invoice paid', action.invoiceNumber), ...notify(state, `${action.invoiceNumber} marked paid.`) };
    }

    case 'SEND_INVOICE': {
      const invoice = state.invoices.find(i => i.number === action.invoiceNumber);
      const newStatus = invoice?.status === 'Paid' ? 'Paid' : 'Sent';
      const invoices = state.invoices.map(i => i.number === action.invoiceNumber ? { ...i, status: newStatus } : i);
      const jobCards = state.jobCards.map(j => {
        if (j.invoice !== action.invoiceNumber) return j;
        return addWorkflowStep({ ...j, nextAction: newStatus === 'Paid' ? 'Schedule follow-up' : 'Await payment' }, 'Invoice Sent');
      });
      return { ...state, invoices, jobCards, auditLogs: addAudit(state, 'Invoice sent', action.invoiceNumber), ...notify(state, `${action.invoiceNumber} sent with payment link.`) };
    }

    case 'VIEW_INVOICE':
      return { ...state, selectedInvoice: action.invoiceNumber, ...notify(state, `${action.invoiceNumber} loaded in invoice preview.`) };

    case 'INVOICE_ACTION':
      return { ...state, ...notify(state, `${action.action} applied to ${action.invoiceNumber}.`) };

    case 'RESERVE_PART': {
      const part = state.parts.find(p => p.partNumber === action.partNumber);
      if (!part || part.quantity <= 0) return state;
      const parts = state.parts.map(p => p.partNumber === action.partNumber ? { ...p, quantity: p.quantity - 1 } : p);
      return { ...state, parts, ...notify(state, `${action.partNumber} reserved for the active job card.`) };
    }

    case 'SEND_FOLLOWUP': {
      const customers = state.customers.map(c => c.id === action.customerId ? { ...c, followUp: 'Follow-up sent just now' } : c);
      const customer = customers.find(c => c.id === action.customerId);
      return { ...state, customers, ...notify(state, `Follow-up sent to ${customer?.name || action.customerId}.`) };
    }

    case 'CREATE_JOB_FROM_VEHICLE': {
      const vehicle = state.vehicles[action.vehicleIndex];
      if (!vehicle) return state;
      const id = nextNumber('JC-', state.jobCards as unknown as Record<string, unknown>[], 'id');
      const customer = state.customers.find(c => c.id === vehicle.customerId);
      const newJob: JobCard = {
        id, ro: null, invoice: null, customer: customer?.name || 'Vehicle Owner', vehicle: vehicle.label,
        serviceType: vehicle.recommendation, channel: 'Shop bay', location: 'Service advisor intake',
        technician: 'Unassigned', status: 'Booked', priority: 'Normal', approval: 'Pending',
        laborHours: 1, partsTotal: 0, workflow: ['Booked'], nextAction: 'Assign technician',
      };
      const vehicles = state.vehicles.map((v, i) => i === action.vehicleIndex ? { ...v, status: 'Open Job' } : v);
      return { ...state, jobCards: [newJob, ...state.jobCards], vehicles, activeModule: 'job-cards', ...notify(state, `${id} created from ${vehicle.label}.`) };
    }

    case 'CHECK_IN': {
      const appointments = state.appointments.map((a, i) => i === action.appointmentIndex ? [a[0], a[1], a[2], a[3], a[4], a[5], 'Checked in'] as typeof a : a);
      const appt = state.appointments[action.appointmentIndex];
      return { ...state, appointments, ...notify(state, `${appt[1]} checked in for ${appt[3]}.`) };
    }

    case 'SEND_REMINDER': {
      const appt = state.appointments[action.appointmentIndex];
      const msgId = `MSG-${state.messages.length + 1}`;
      const newMsg = { id: msgId, customer: appt[1], channel: 'SMS', subject: 'Appointment reminder', status: 'Sent', body: `Reminder sent for ${appt[3]} at ${appt[0]}.` };
      const appointments = state.appointments.map((a, i) => i === action.appointmentIndex ? [a[0], a[1], a[2], a[3], a[4], a[5], 'Reminder sent'] as typeof a : a);
      return { ...state, appointments, messages: [newMsg, ...state.messages], ...notify(state, `Reminder sent to ${appt[1]}.`) };
    }

    case 'COMPLETE_INSPECTION': {
      const inspection = state.inspections.find(i => i.id === action.inspectionId);
      const inspections = state.inspections.map(i => i.id === action.inspectionId ? { ...i, status: 'Completed' } : i);
      const jobCards = inspection ? state.jobCards.map(j => {
        if (j.id !== inspection.jobCard) return j;
        return addWorkflowStep({ ...j, nextAction: 'Review estimate' }, 'Inspection Complete');
      }) : state.jobCards;
      return { ...state, inspections, jobCards, ...notify(state, `${action.inspectionId} completed and linked to ${inspection?.jobCard}.`) };
    }

    case 'CREATE_ESTIMATE_FROM_INSPECTION': {
      const inspection = state.inspections.find(i => i.id === action.inspectionId);
      if (!inspection) return state;
      const job = state.jobCards.find(j => j.id === inspection.jobCard);
      const id = nextNumber('EST-', state.estimates as unknown as Record<string, unknown>[], 'id');
      const newEstimate = {
        id, jobCard: inspection.jobCard, customer: job?.customer || 'Customer', vehicle: inspection.vehicle,
        status: 'Draft', total: 295,
        lines: inspection.items.filter(item => item[1] !== 'Pass').map(item => `${item[0]} - ${item[1]}`),
      };
      return { ...state, estimates: [newEstimate, ...state.estimates], activeModule: 'estimates', ...notify(state, `${id} created from ${action.inspectionId}.`) };
    }

    case 'SEND_MESSAGE': {
      const msg = state.messages.find(m => m.id === action.messageId);
      const messages = state.messages.map(m => m.id === action.messageId ? { ...m, status: 'Sent' } : m);
      return { ...state, messages, ...notify(state, `${msg?.channel} sent to ${msg?.customer}.`) };
    }

    case 'APPROVE_ESTIMATE': {
      const estimate = state.estimates.find(e => e.id === action.estimateId);
      const estimates = state.estimates.map(e => e.id === action.estimateId ? { ...e, status: 'Approved' } : e);
      const jobCards = estimate ? state.jobCards.map(j => {
        if (j.id !== estimate.jobCard) return j;
        return addWorkflowStep({ ...j, approval: 'Approved', status: 'Approved' }, 'Estimate Approved');
      }) : state.jobCards;
      return { ...state, estimates, jobCards, ...notify(state, `${action.estimateId} approved.`) };
    }

    case 'DECLINE_ESTIMATE': {
      const estimates = state.estimates.map(e => e.id === action.estimateId ? { ...e, status: 'Declined' } : e);
      return { ...state, estimates, ...notify(state, `${action.estimateId} declined and queued for follow-up.`) };
    }

    case 'ESTIMATE_TO_INVOICE': {
      const estimate = state.estimates.find(e => e.id === action.estimateId);
      if (!estimate) return state;
      const estimates = state.estimates.map(e => e.id === action.estimateId ? { ...e, status: 'Approved' } : e);
      const s2 = { ...state, estimates };
      const finalState = appReducer(s2, { type: 'CREATE_INVOICE_FROM_JOB', jobId: estimate.jobCard });
      return finalState;
    }

    case 'START_TASK': {
      const task = state.technicianTasks.find(t => t.id === action.taskId);
      const technicianTasks = state.technicianTasks.map(t => t.id === action.taskId ? { ...t, status: 'In Progress' } : t);
      const jobCards = task ? state.jobCards.map(j => {
        if (j.id !== task.jobCard) return j;
        return addWorkflowStep({ ...j, status: 'In Progress' }, 'Tech Started');
      }) : state.jobCards;
      return { ...state, technicianTasks, jobCards, ...notify(state, `${action.taskId} started by ${task?.technician}.`) };
    }

    case 'COMPLETE_TASK': {
      const task = state.technicianTasks.find(t => t.id === action.taskId);
      const technicianTasks = state.technicianTasks.map(t => t.id === action.taskId ? { ...t, status: 'Completed' } : t);
      const jobCards = task ? state.jobCards.map(j => {
        if (j.id !== task.jobCard) return j;
        return addWorkflowStep({ ...j, status: 'Ready to Invoice', nextAction: 'Create invoice' }, 'Work Complete');
      }) : state.jobCards;
      return { ...state, technicianTasks, jobCards, ...notify(state, `${action.taskId} completed. ${task?.jobCard} is ready to invoice.`) };
    }

    case 'EXPORT_REPORT':
      return { ...state, ...notify(state, `${action.reportName} report exported.`) };

    case 'SAVE_SETTINGS':
      return { ...state, ...notify(state, 'Settings saved for this prototype session.') };

    case 'SEND_AI_DRAFT': {
      const jobCards = state.jobCards.map(j => {
        if (j.id !== 'JC-3109') return j;
        return addWorkflowStep({ ...j, nextAction: 'Await customer response' }, 'AI Message Sent');
      });
      return { ...state, jobCards, ...notify(state, 'AI customer approval draft sent to Maya Rodriguez.') };
    }

    case 'ATTACH_AI_NOTE': {
      const jobCards = state.jobCards.map(j => {
        if (j.id !== 'JC-3109') return j;
        return addWorkflowStep({ ...j, nextAction: 'AI note attached for advisor review' }, 'AI Note Attached');
      });
      return { ...state, jobCards, ...notify(state, 'AI note attached to JC-3109.') };
    }

    case 'DECODE_VIN':
      return { ...state, vinResult: action.result, ...notify(state, 'VIN decoded and ready to attach to a vehicle or job card.') };

    case 'LOOKUP_DTC':
      return { ...state, dtcResult: action.result, ...notify(state, `${action.result.code} lookup completed.`) };

    case 'SET_SCAN_STATUS':
      return { ...state, scanStatus: action.status };

    case 'READ_CODES':
      return { ...state, diagnosticCodes: action.codes, ...notify(state, 'Trouble codes read from simulated scan tool.') };

    case 'CLEAR_CODES':
      return { ...state, diagnosticCodes: [], ...notify(state, 'Trouble codes cleared in simulated session.') };

    case 'SAVE_DIAGNOSTIC': {
      const jobCards = state.jobCards.map(j => {
        if (j.id !== 'JC-3110') return j;
        return addWorkflowStep({ ...j, nextAction: 'Review AI diagnostic summary' }, 'Diagnostic Report Saved');
      });
      return { ...state, jobCards, ...notify(state, 'Diagnostic report saved to JC-3110.') };
    }

    default:
      return state;
  }
}

const StateContext = createContext<AppState>(initialState);
const DispatchContext = createContext<React.Dispatch<AppAction>>(() => {});

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>
        {children}
      </DispatchContext.Provider>
    </StateContext.Provider>
  );
}

export function useAppState() {
  return useContext(StateContext);
}

export function useAppDispatch() {
  return useContext(DispatchContext);
}
