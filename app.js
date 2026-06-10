import { decodeVin } from "./services/vinDecoderService.js";
import { lookupDtc } from "./services/dtcLookupService.js";
import { connectScanTool, readTroubleCodes, clearTroubleCodes } from "./services/scanToolService.js";
import { calculateInvoice } from "./services/invoiceService.js";
import { partsInventory } from "./services/partsInventoryService.js";

const state = {
  activeModule: "dashboard",
  selectedInvoice: "INV-10091",
  currentUserId: "U-1",
  currentPlan: "Pro Trial",
  scanStatus: "Disconnected",
  vinResult: null,
  dtcResult: null,
  diagnosticCodes: [],
  toast: "Ready. Use the workflow buttons to create jobs, approve work, invoice, and save diagnostics.",
  activityLog: ["System ready", "AI Copilot loaded", "Invoice workflow linked to job cards"]
};

const users = [
  { id: "U-1", name: "Sam Owner", email: "owner@redline.example", role: "Owner", status: "Active", lastLogin: "Today" },
  { id: "U-2", name: "Avery Advisor", email: "advisor@redline.example", role: "Service Advisor", status: "Active", lastLogin: "Today" },
  { id: "U-3", name: "Priya Shah", email: "priya@redline.example", role: "Technician", status: "Active", lastLogin: "Yesterday" },
  { id: "U-4", name: "Morgan Parts", email: "parts@redline.example", role: "Parts Manager", status: "Invited", lastLogin: "Never" }
];

const planCatalog = {
  Free: {
    price: "$0",
    limits: { users: 2, locations: 1, customers: 25, vehicles: 25, jobs: 20, invoices: 10, aiCredits: 0 },
    features: ["Basic CRM", "Basic scheduling", "Manual invoices", "Mock VIN/DTC", "Simulated scan tool"]
  },
  Starter: {
    price: "$39/mo",
    limits: { users: 4, locations: 1, customers: 250, vehicles: 250, jobs: 150, invoices: 100, aiCredits: 50 },
    features: ["Digital inspections", "Estimate approvals", "Communication templates", "Basic AI"]
  },
  Pro: {
    price: "$99/mo",
    limits: { users: 12, locations: 3, customers: 2000, vehicles: 3000, jobs: 1000, invoices: 750, aiCredits: 500 },
    features: ["Parts inventory", "Payments", "SMS/email integrations", "VIN/DTC provider ready", "Advanced reports"]
  },
  "Pro Trial": {
    price: "Trial",
    limits: { users: 12, locations: 3, customers: 2000, vehicles: 3000, jobs: 1000, invoices: 750, aiCredits: 500 },
    features: ["All Pro MVP features enabled for demo"]
  },
  Enterprise: {
    price: "Custom",
    limits: { users: 999, locations: 999, customers: 999999, vehicles: 999999, jobs: 999999, invoices: 999999, aiCredits: 5000 },
    features: ["Multi-location", "Fleet accounts", "PO rules", "SLA tracking", "API access", "Audit logs"]
  }
};

const customers = [
  { id: "C-1042", name: "Northline Fleet Services", type: "Fleet", phone: "(555) 013-4881", email: "ops@northline.example", address: "2100 Harbor Industrial Pkwy", tags: ["Priority", "Net 30"], followUp: "Brake invoice ready for payment" },
  { id: "C-1088", name: "Maya Rodriguez", type: "Retail", phone: "(555) 014-2990", email: "maya.r@example.com", address: "84 Briar Lane", tags: ["Mobile", "SMS OK"], followUp: "Approve 60k mobile service estimate" },
  { id: "C-1170", name: "Westside Auto Group", type: "Dealer", phone: "(555) 018-0033", email: "parts@westside.example", address: "700 Market Street", tags: ["Wholesale", "Multi-location"], followUp: "Diagnostic estimate review" },
  { id: "C-1194", name: "Apex Logistics Group", type: "Enterprise Fleet", phone: "(555) 017-8220", email: "fleet@apex.example", address: "8 regional depots", tags: ["National", "PO Required"], followUp: "Quarterly SLA report due" }
];

const vehicles = [
  { customerId: "C-1042", vin: "1FTFW1E85PFA24680", label: "2023 Ford F-150 XL", trim: "SuperCrew 4WD", engine: "3.5L EcoBoost", transmission: "10-speed automatic", mileage: "48,221", plate: "FLT-2048", status: "Open Job", recommendation: "Front pads and rotors" },
  { customerId: "C-1088", vin: "2T3P1RFV7MW123456", label: "2021 Toyota RAV4 XLE", trim: "AWD", engine: "2.5L I4", transmission: "8-speed automatic", mileage: "61,004", plate: "MRA-418", status: "Mobile Dispatch", recommendation: "60k service package" },
  { customerId: "C-1170", vin: "WBA5R1C05LFH11223", label: "2020 BMW 330i", trim: "Sport Line", engine: "2.0L turbo", transmission: "8-speed automatic", mileage: "37,900", plate: "DLR-330", status: "Diagnostic", recommendation: "DTC P0420 inspection" }
];

const jobCards = [
  {
    id: "JC-3108",
    ro: "RO-24019",
    invoice: "INV-10091",
    customer: "Northline Fleet Services",
    vehicle: "2023 Ford F-150",
    serviceType: "Fleet brake service",
    channel: "Shop bay",
    location: "Downtown Branch / Bay 2",
    technician: "Jordan Lee",
    status: "Ready to Invoice",
    priority: "High",
    approval: "Approved",
    laborHours: 2.1,
    partsTotal: 365.5,
    workflow: ["Booked", "Inspected", "Approved", "Parts Picked", "Work Complete", "Invoice Created"],
    nextAction: "Collect payment or post to fleet account"
  },
  {
    id: "JC-3109",
    ro: "RO-24020",
    invoice: "INV-10092",
    customer: "Maya Rodriguez",
    vehicle: "2021 Toyota RAV4",
    serviceType: "60k maintenance",
    channel: "Mobile mechanic",
    location: "Customer driveway - 84 Briar Lane",
    technician: "Priya Shah",
    status: "Awaiting Approval",
    priority: "Normal",
    approval: "Pending",
    laborHours: 1.7,
    partsTotal: 112.45,
    workflow: ["Booked", "Dispatched", "Inspection Sent", "Awaiting Approval"],
    nextAction: "Customer approval by SMS"
  },
  {
    id: "JC-3110",
    ro: "RO-24021",
    invoice: null,
    customer: "Westside Auto Group",
    vehicle: "2020 BMW 330i",
    serviceType: "Check engine diagnostic",
    channel: "Dealer wholesale",
    location: "North Branch / Diagnostic Bay",
    technician: "Alex Kim",
    status: "Diagnostic",
    priority: "Normal",
    approval: "Internal",
    laborHours: 1.2,
    partsTotal: 0,
    workflow: ["Booked", "Checked In", "Scan Tool Connected", "DTC Report Saved"],
    nextAction: "Convert diagnostic findings to estimate"
  }
];

const repairOrders = [
  { ro: "RO-24019", jobCard: "JC-3108", customer: "Northline Fleet Services", vehicle: "2023 Ford F-150", concern: "Brake noise and vibration", cause: "Front rotors below spec, pads glazed", correction: "Replace front pads and rotors, road test", tech: "Jordan Lee", status: "Waiting on Parts", approval: "Approved", total: 842.5 },
  { ro: "RO-24020", jobCard: "JC-3109", customer: "Maya Rodriguez", vehicle: "2021 Toyota RAV4", concern: "Maintenance service", cause: "Scheduled 60k interval", correction: "Oil, filters, inspection, tire rotation", tech: "Priya Shah", status: "Scheduled", approval: "Pending", total: 389.95 },
  { ro: "RO-24021", jobCard: "JC-3110", customer: "Westside Auto Group", vehicle: "2020 BMW 330i", concern: "Check engine light", cause: "Catalyst efficiency fault stored", correction: "Perform smoke test and oxygen sensor graphing", tech: "Alex Kim", status: "In Progress", approval: "Internal", total: 210 }
];

const appointments = [
  ["8:00 AM", "Northline Fleet", "Ford F-150", "Brakes", "JC-3108", "Bay 2", "Confirmed"],
  ["10:30 AM", "Maya Rodriguez", "Toyota RAV4", "60k mobile service", "JC-3109", "Mobile Route 1", "Reminder sent"],
  ["1:00 PM", "Apex Logistics", "Transit 250", "No start", "New Job", "Depot Dispatch", "Awaiting tow"],
  ["3:30 PM", "Westside Auto Group", "BMW 330i", "CEL diagnostic", "JC-3110", "Bay 3", "Checked in"]
];

const invoices = [
  { number: "INV-10091", jobCard: "JC-3108", customer: "Northline Fleet Services", vehicle: "2023 Ford F-150", status: "Unpaid", lines: [["Front brake labor", 2.1, 145], ["Brake pads premium", 1, 129.5], ["Front rotors", 2, 118]], discount: 25, shopSupplies: 19.5, taxRate: 0.0825 },
  { number: "INV-10092", jobCard: "JC-3109", customer: "Maya Rodriguez", vehicle: "2021 Toyota RAV4", status: "Draft", lines: [["60k mobile service labor", 1.7, 145], ["Synthetic oil kit", 1, 72.5], ["Cabin air filter", 1, 39.95], ["Mobile service call", 1, 65]], discount: 0, shopSupplies: 12, taxRate: 0.0825 }
];

const reports = [
  ["Revenue", "$48,620", "+11.8% vs last month"],
  ["Outstanding invoices", "$9,430", "14 invoices pending"],
  ["Job cycle time", "1.8 days", "Booked to paid"],
  ["Mobile route revenue", "$7,880", "6 jobs this week"],
  ["Technician productivity", "86%", "Target 82%"],
  ["Fleet retention", "93%", "6 active fleet accounts"]
];

const aiInsights = [
  {
    area: "Job triage",
    recommendation: "Move JC-3109 to the first mobile route stop because parts are in stock and approval is one SMS away.",
    impact: "Reduces same-day route idle time"
  },
  {
    area: "Invoice review",
    recommendation: "INV-10091 has labor, parts, shop supplies, and fleet terms captured. Add PO before sending.",
    impact: "Prevents enterprise payment delay"
  },
  {
    area: "Diagnostic assist",
    recommendation: "P0420 on JC-3110 should include oxygen sensor graphing and exhaust leak inspection before catalyst quote.",
    impact: "Improves first-time authorization"
  },
  {
    area: "Customer follow-up",
    recommendation: "Send Maya Rodriguez a short approval message with mobile ETA, total estimate, and payment link.",
    impact: "Improves approval conversion"
  }
];

const messages = [
  { id: "MSG-1", customer: "Maya Rodriguez", channel: "SMS", subject: "Estimate approval", status: "Draft", body: "Your 60k mobile service estimate is ready for approval." },
  { id: "MSG-2", customer: "Northline Fleet Services", channel: "Email", subject: "Invoice payment link", status: "Queued", body: "Invoice INV-10091 is ready with fleet account terms." },
  { id: "MSG-3", customer: "Westside Auto Group", channel: "Email", subject: "Diagnostic findings", status: "Sent", body: "P0420 diagnostic summary attached to JC-3110." }
];

const inspections = [
  { id: "DI-2201", jobCard: "JC-3109", vehicle: "2021 Toyota RAV4", technician: "Priya Shah", status: "In Progress", items: [["Tires", "Pass"], ["Brakes", "Attention"], ["Fluids", "Pass"], ["Battery", "Pass"], ["Photos", "2 attached"]] },
  { id: "DI-2202", jobCard: "JC-3110", vehicle: "2020 BMW 330i", technician: "Alex Kim", status: "Review", items: [["MIL / CEL", "Fail"], ["Exhaust leak check", "Attention"], ["O2 graph", "Pending"], ["Freeze frame", "Captured"]] }
];

const estimates = [
  { id: "EST-5007", jobCard: "JC-3109", customer: "Maya Rodriguez", vehicle: "2021 Toyota RAV4", status: "Pending Approval", total: 389.95, lines: ["60k mobile service", "Synthetic oil kit", "Cabin air filter", "Mobile service call"] },
  { id: "EST-5008", jobCard: "JC-3110", customer: "Westside Auto Group", vehicle: "2020 BMW 330i", status: "Draft", total: 210, lines: ["Diagnostic labor", "O2 sensor graphing", "Smoke test"] }
];

const technicianTasks = [
  { id: "TASK-80", jobCard: "JC-3108", technician: "Jordan Lee", task: "Install front brake pads and rotors", status: "Assigned", time: "2.1h" },
  { id: "TASK-81", jobCard: "JC-3109", technician: "Priya Shah", task: "Perform 60k mobile service", status: "Waiting Approval", time: "1.7h" },
  { id: "TASK-82", jobCard: "JC-3110", technician: "Alex Kim", task: "Complete P0420 diagnostic workflow", status: "In Progress", time: "1.2h" }
];

const payments = [
  { id: "PAY-7001", invoice: "INV-10092", customer: "Maya Rodriguez", amount: 491.94, method: "Manual card", status: "Recorded", date: "Today" }
];

const auditLogs = [
  { action: "User login", user: "Sam Owner", entity: "Session", time: "Today" },
  { action: "Plan enabled", user: "Sam Owner", entity: "Pro Trial", time: "Today" },
  { action: "Invoice linked", user: "System", entity: "INV-10091", time: "Today" }
];

const nav = [
  ["dashboard", "dashboard", "Dashboard", "12"],
  ["access", "userkey", "Login & Roles", "4"],
  ["subscriptions", "shield", "Plans & Gates", state.currentPlan],
  ["ai", "ai", "AI Copilot", "4"],
  ["customers", "customers", "Customers", "138"],
  ["vehicles", "vehicle", "Vehicles", "312"],
  ["job-cards", "clipboard", "Job Cards", "18"],
  ["scheduling", "calendar", "Scheduling", "9"],
  ["inspections", "inspection", "Inspections", "2"],
  ["communication", "message", "Communication", "3"],
  ["estimates", "estimate", "Estimates", "2"],
  ["repair-orders", "wrench", "Repair Orders", "21"],
  ["invoices", "invoice", "Invoicing", "14"],
  ["payments", "payment", "Payments", String(payments.length)],
  ["parts", "parts", "Parts", "486"],
  ["technicians", "technician", "Tech Workflow", "3"],
  ["vin", "vin", "VIN Decode", ""],
  ["dtc", "warning", "DTC Lookup", ""],
  ["diagnostics", "scan", "Diagnostics", "3"],
  ["appointments", "calendar", "Appointments", "9"],
  ["reports", "chart", "Reports", ""],
  ["settings", "settings", "Settings", ""]
];

const titles = {
  dashboard: ["Operations Dashboard", "Live view of job cards, repair orders, invoices, parts, and diagnostics"],
  access: ["Login and Role Control", "User authentication, invitations, sessions, roles, and staff permissions"],
  subscriptions: ["Subscriptions and Feature Gates", "Free plan restrictions, paid subscriber controls, limits, and upgrade path"],
  ai: ["AI Copilot", "Artificial intelligence for estimates, diagnostics, invoices, routing, and customer follow-up"],
  customers: ["Customer CRM", "Customer accounts, communications, reminders, vehicles, and history"],
  vehicles: ["Vehicle Management", "VIN, mileage, drivetrain, service history, diagnostics, and recommendations"],
  "job-cards": ["Job Cards", "Dispatch, inspect, approve, complete, and invoice every service job"],
  scheduling: ["Scheduling", "Calendar, route, bay, technician, appointment, and reminder workflow"],
  inspections: ["Digital Inspections", "Guided inspection checklists, findings, photos, approvals, and customer reports"],
  communication: ["Customer Communication", "SMS, email, approvals, payment links, reminders, and follow-up history"],
  estimates: ["Estimates", "Build, approve, decline, and convert estimates into repair orders and invoices"],
  "repair-orders": ["Repair Orders", "Complaint, cause, correction, labor, parts, approvals, and workflow"],
  invoices: ["Invoicing", "Invoices generated from approved job cards, labor, parts, diagnostics, and fees"],
  payments: ["Payments", "Manual payment recording, balances, paid status, and future Stripe-ready workflow"],
  parts: ["Parts Inventory", "Inventory, suppliers, bin locations, margins, and parts sales"],
  technicians: ["Technician Workflow", "Assigned work, labor time, inspection findings, diagnostics, and completion status"],
  vin: ["VIN Decoder", "Mock VIN decode flow structured for future provider integration"],
  dtc: ["DTC Lookup", "Diagnostic trouble code knowledge base and service guidance"],
  diagnostics: ["Scan Tool Interface", "Simulated OBD-II session designed for future hardware integration"],
  appointments: ["Appointments", "Schedule, route, bay assignment, technician workload, and reminders"],
  reports: ["Reports", "Revenue, inventory, productivity, diagnostics, retention, and job cycle reporting"],
  settings: ["Settings", "Shop profile, mobile operations, branches, roles, numbering, and integration placeholders"]
};

function money(value) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function badge(text) {
  const key = String(text).toLowerCase();
  const color = key.includes("paid") || key.includes("approved") || key.includes("confirmed") || key.includes("connected") || key.includes("ready")
    ? "green"
    : key.includes("waiting") || key.includes("pending") || key.includes("draft") || key.includes("scheduled") || key.includes("approval")
      ? "yellow"
      : key.includes("unpaid") || key.includes("low") || key.includes("critical")
        ? "red"
        : key.includes("progress") || key.includes("diagnostic") || key.includes("mobile") || key.includes("dispatch")
          ? "blue"
          : "gray";
  return `<span class="badge ${color}">${text}</span>`;
}

function table(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function stat(label, value, subtext) {
  return `<div class="card stat"><div class="label">${label}</div><strong>${value}</strong><span>${subtext}</span></div>`;
}

function panel(title, hint, body, action = "") {
  return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ""}</div>${action}</div>${body}</section>`;
}

function iconSvg(name) {
  const paths = {
    ai: `<path d="M12 3l1.4 4.2L18 8l-4.6 1.8L12 14l-1.4-4.2L6 8l4.6-.8z"></path><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"></path><path d="M5 13l.6 1.6L7 15l-1.4.4L5 17l-.6-1.6L3 15l1.4-.4z"></path>`,
    userkey: `<circle cx="9" cy="8" r="4"></circle><path d="M3 21a6 6 0 0 1 12 0"></path><path d="M15 11h7"></path><path d="M19 11v3"></path>`,
    shield: `<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"></path><path d="M9 12l2 2 4-5"></path>`,
    dashboard: `<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>`,
    customers: `<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>`,
    vehicle: `<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"></path><path d="M3 13h18v6H3z"></path><circle cx="7" cy="19" r="2"></circle><circle cx="17" cy="19" r="2"></circle>`,
    clipboard: `<path d="M9 4h6l1 2h3v18H5V6h3z"></path><path d="M9 4a3 3 0 0 1 6 0"></path><path d="M8 11h8"></path><path d="M8 16h6"></path>`,
    inspection: `<path d="M8 4h8l1 2h3v18H4V6h3z"></path><path d="M8 12l2 2 4-5"></path><path d="M8 18h8"></path>`,
    message: `<path d="M4 5h16v12H7l-3 3z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path>`,
    estimate: `<path d="M5 3h14v18H5z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path><path d="M16 16h1"></path>`,
    wrench: `<path d="M15 6a5 5 0 0 0 6 6L11 22l-5-5 10-10z"></path><path d="M7 17l-2 2"></path>`,
    invoice: `<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M9 16h4"></path>`,
    payment: `<path d="M3 6h18v14H3z"></path><path d="M3 10h18"></path><path d="M7 15h5"></path><path d="M16 15h2"></path>`,
    parts: `<path d="M12 2l9 5-9 5-9-5z"></path><path d="M3 7v10l9 5 9-5V7"></path><path d="M12 12v10"></path>`,
    vin: `<path d="M4 5h16v14H4z"></path><path d="M7 9h10"></path><path d="M7 13h6"></path><path d="M16 13h1"></path>`,
    warning: `<path d="M12 3l10 18H2z"></path><path d="M12 9v5"></path><path d="M12 18h.01"></path>`,
    scan: `<path d="M4 7V4h3"></path><path d="M17 4h3v3"></path><path d="M20 17v3h-3"></path><path d="M7 20H4v-3"></path><path d="M7 12h10"></path><path d="M9 9h6"></path><path d="M9 15h6"></path>`,
    calendar: `<path d="M4 5h16v17H4z"></path><path d="M8 2v5"></path><path d="M16 2v5"></path><path d="M4 10h16"></path>`,
    technician: `<circle cx="12" cy="7" r="4"></circle><path d="M5 22a7 7 0 0 1 14 0"></path><path d="M9 14l3 3 3-3"></path>`,
    chart: `<path d="M4 19V5"></path><path d="M4 19h18"></path><path d="M8 16v-5"></path><path d="M13 16V8"></path><path d="M18 16v-9"></path>`,
    settings: `<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a8 8 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 5h-4l-.4 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 3h4l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5z"></path>`,
    add: `<path d="M12 5v14"></path><path d="M5 12h14"></path>`,
    send: `<path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4z"></path>`
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.dashboard}</svg>`;
}

function iconColor(moduleId) {
  const colors = {
    dashboard: "#39a0ed",
    access: "#22c55e",
    subscriptions: "#a855f7",
    ai: "#9b5de5",
    customers: "#2fbf71",
    vehicles: "#f59e0b",
    "job-cards": "#14b8a6",
    scheduling: "#ec4899",
    inspections: "#10b981",
    communication: "#0ea5e9",
    estimates: "#eab308",
    "repair-orders": "#ef4444",
    invoices: "#22c55e",
    payments: "#16a34a",
    parts: "#8b5cf6",
    technicians: "#f43f5e",
    vin: "#06b6d4",
    dtc: "#f97316",
    diagnostics: "#3b82f6",
    appointments: "#ec4899",
    reports: "#64748b",
    settings: "#94a3b8"
  };
  return colors[moduleId] || "#9eb2c2";
}

function workflow(items) {
  return `<div class="workflow">${items.map((item, index) => `<span class="workflow-step ${index === items.length - 1 ? "current" : ""}">${item}</span>`).join("")}</div>`;
}

function findJob(id) {
  return jobCards.find((job) => job.id === id);
}

function notify(message) {
  state.toast = message;
  state.activityLog = [message, ...state.activityLog].slice(0, 6);
  const toast = document.querySelector(".toast");
  if (toast) toast.textContent = message;
}

function currentUser() {
  return users.find((user) => user.id === state.currentUserId) || users[0];
}

function audit(action, entity) {
  auditLogs.unshift({ action, user: currentUser().name, entity, time: "Just now" });
}

function currentPlan() {
  return planCatalog[state.currentPlan] || planCatalog.Free;
}

function usageRows() {
  const limits = currentPlan().limits;
  const usage = {
    users: users.length,
    locations: 3,
    customers: customers.length,
    vehicles: vehicles.length,
    jobs: jobCards.length,
    invoices: invoices.length,
    aiCredits: 18
  };
  return Object.entries(limits).map(([key, limit]) => {
    const used = usage[key] ?? 0;
    const percent = Math.min(100, Math.round((used / limit) * 100));
    return [key, `${used} / ${limit}`, `<div class="meter"><span style="width:${percent}%"></span></div>`, used >= limit ? badge("Limit reached") : badge("Available")];
  });
}

function nextNumber(prefix, collection, field) {
  const max = collection.reduce((highest, item) => {
    const value = String(item[field] || "");
    if (!value.startsWith(prefix)) return highest;
    return Math.max(highest, Number(value.replace(prefix, "")) || 0);
  }, 0);
  return `${prefix}${max + 1}`;
}

function customerVehicleFor(customer) {
  if (customer.includes("Maya")) return "2021 Toyota RAV4";
  if (customer.includes("Northline")) return "2023 Ford F-150";
  if (customer.includes("Apex")) return "Ford Transit 250";
  return "Vehicle pending";
}

function addWorkflowStep(job, step) {
  if (!job.workflow.includes(step)) job.workflow.push(step);
}

function createJobCardFromForm() {
  const customer = document.querySelector("#job-customer")?.value || "Walk-in Customer";
  const workType = document.querySelector("#job-work-type")?.value || "Shop repair";
  const priority = document.querySelector("#job-priority")?.value || "Normal";
  const route = document.querySelector("#job-route")?.value || "Downtown Branch";
  const location = document.querySelector("#job-location")?.value || "Service location pending";
  const technician = document.querySelector("#job-tech")?.value || "Unassigned";
  const approvalCode = document.querySelector("#job-approval")?.value.trim();
  const id = nextNumber("JC-", jobCards, "id");
  const job = {
    id,
    ro: null,
    invoice: null,
    customer,
    vehicle: customerVehicleFor(customer),
    serviceType: workType,
    channel: workType.includes("Mobile") ? "Mobile mechanic" : workType.includes("Fleet") ? "Fleet service" : "Shop bay",
    location,
    technician,
    status: approvalCode ? "Approved" : "Booked",
    priority,
    approval: approvalCode ? "Approved" : "Pending",
    laborHours: workType.includes("Diagnostic") ? 1.1 : 1.6,
    partsTotal: workType.includes("Diagnostic") ? 0 : 96.5,
    workflow: approvalCode ? ["Booked", "Approved"] : ["Booked"],
    nextAction: approvalCode ? "Convert to repair order" : "Request approval"
  };
  jobCards.unshift(job);
  appointments.unshift(["Next", customer.split(" ")[0], job.vehicle, workType, id, route, "Booked"]);
  notify(`${id} created for ${customer}.`);
  state.activeModule = "job-cards";
  renderShell();
}

function approveJob(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  job.status = "Approved";
  job.approval = "Approved";
  job.nextAction = "Convert to repair order";
  addWorkflowStep(job, "Approved");
  notify(`${jobId} approved and ready for RO conversion.`);
  renderShell();
}

function convertJobToRo(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  if (!job.ro) {
    job.ro = nextNumber("RO-", repairOrders, "ro");
    repairOrders.unshift({
      ro: job.ro,
      jobCard: job.id,
      customer: job.customer,
      vehicle: job.vehicle,
      concern: job.serviceType,
      cause: "Inspection findings pending",
      correction: "Technician to complete workflow and record correction",
      tech: job.technician,
      status: "In Progress",
      approval: job.approval,
      total: job.laborHours * 145 + job.partsTotal
    });
  }
  job.status = "In Progress";
  job.nextAction = "Complete work and create invoice";
  addWorkflowStep(job, "Repair Order");
  notify(`${job.id} converted to ${job.ro}.`);
  state.activeModule = "repair-orders";
  renderShell();
}

function createInvoiceFromJob(jobId) {
  const job = findJob(jobId);
  if (!job) return;
  if (!job.ro) convertJobToRo(jobId);
  const refreshedJob = findJob(jobId);
  if (refreshedJob.invoice) {
    state.selectedInvoice = refreshedJob.invoice;
    notify(`${refreshedJob.invoice} is already linked to ${jobId}.`);
    state.activeModule = "invoices";
    renderShell();
    return;
  }
  const invoiceNumber = nextNumber("INV-", invoices, "number");
  invoices.unshift({
    number: invoiceNumber,
    jobCard: refreshedJob.id,
    customer: refreshedJob.customer,
    vehicle: refreshedJob.vehicle,
    status: "Draft",
    lines: [
      [`${refreshedJob.serviceType} labor`, refreshedJob.laborHours, 145],
      ["Parts and materials", 1, refreshedJob.partsTotal],
      [refreshedJob.channel.includes("Mobile") ? "Mobile service call" : "Shop supplies", 1, refreshedJob.channel.includes("Mobile") ? 65 : 18]
    ],
    discount: 0,
    shopSupplies: 12,
    taxRate: 0.0825
  });
  refreshedJob.invoice = invoiceNumber;
  refreshedJob.status = "Ready to Invoice";
  refreshedJob.nextAction = "Send invoice";
  addWorkflowStep(refreshedJob, "Invoice Created");
  state.selectedInvoice = invoiceNumber;
  notify(`${invoiceNumber} created from ${jobId}.`);
  state.activeModule = "invoices";
  renderShell();
}

function markInvoicePaid(invoiceNumber) {
  const invoice = invoices.find((item) => item.number === invoiceNumber);
  if (!invoice) return;
  invoice.status = "Paid";
  const job = findJob(invoice.jobCard);
  if (job) {
    job.status = "Paid";
    job.nextAction = "Schedule follow-up";
    addWorkflowStep(job, "Paid");
  }
  if (!payments.some((payment) => payment.invoice === invoiceNumber)) {
    payments.unshift({ id: nextNumber("PAY-", payments, "id"), invoice: invoiceNumber, customer: invoice.customer, amount: calculateInvoice(invoice).total, method: "Manual", status: "Recorded", date: "Today" });
  }
  audit("Invoice paid", invoiceNumber);
  notify(`${invoiceNumber} marked paid.`);
  renderShell();
}

function sendInvoice(invoiceNumber) {
  const invoice = invoices.find((item) => item.number === invoiceNumber);
  if (!invoice) return;
  invoice.status = invoice.status === "Paid" ? "Paid" : "Sent";
  const job = findJob(invoice.jobCard);
  if (job) {
    job.nextAction = invoice.status === "Paid" ? "Schedule follow-up" : "Await payment";
    addWorkflowStep(job, "Invoice Sent");
  }
  audit("Invoice sent", invoiceNumber);
  notify(`${invoiceNumber} sent with payment link.`);
  renderShell();
}

function reservePart(partNumber) {
  const part = partsInventory.find((item) => item.partNumber === partNumber);
  if (!part || part.quantity <= 0) return;
  part.quantity -= 1;
  notify(`${part.partNumber} reserved for the active job card.`);
  renderShell();
}

function saveDiagnosticReport() {
  const job = findJob("JC-3110");
  addWorkflowStep(job, "Diagnostic Report Saved");
  job.nextAction = "Review AI diagnostic summary";
  notify("Diagnostic report saved to JC-3110.");
  renderShell();
}

function renderShell() {
  const [title, subtitle] = titles[state.activeModule];
  document.querySelector("#app").innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">RL</div>
          <div><strong>Redline</strong><span>Service, fleet, mobile, parts</span></div>
        </div>
        <nav class="nav">
          ${nav.map(([id, icon, label, count]) => `
            <button class="${state.activeModule === id ? "active" : ""}" data-module="${id}" title="${label}" style="--icon-color:${iconColor(id)}">
              ${iconSvg(icon)}<span class="label">${label}</span><span class="count">${count}</span>
            </button>
          `).join("")}
        </nav>
      </aside>
      <main class="main">
        <header class="topbar">
          <div><h1>${title}</h1><p>${subtitle}</p></div>
          <div class="actions">
            <input class="search" placeholder="Search customers, VINs, job cards, invoices, parts" />
            <button id="top-new-job" class="btn">${iconSvg("add")} New Job Card</button>
            <button id="top-create-invoice" class="btn primary">${iconSvg("invoice")} Create Invoice</button>
          </div>
        </header>
        <div class="content">
          ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
          ${renderModule()}
        </div>
      </main>
    </div>`;

  document.querySelectorAll("[data-module]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeModule = button.dataset.module;
      renderShell();
    });
  });

  bindModuleEvents();
}

function renderModule() {
  const renderers = {
    dashboard: renderDashboard,
    access: renderAccess,
    subscriptions: renderSubscriptions,
    ai: renderAi,
    customers: renderCustomers,
    vehicles: renderVehicles,
    "job-cards": renderJobCards,
    scheduling: renderScheduling,
    inspections: renderInspections,
    communication: renderCommunication,
    estimates: renderEstimates,
    "repair-orders": renderRepairOrders,
    invoices: renderInvoices,
    payments: renderPayments,
    parts: renderParts,
    technicians: renderTechnicians,
    vin: renderVin,
    dtc: renderDtc,
    diagnostics: renderDiagnostics,
    appointments: renderAppointments,
    reports: renderReports,
    settings: renderSettings
  };
  return `<section class="module active">${renderers[state.activeModule]()}</section>`;
}

function renderDashboard() {
  return `
    <div class="grid cols-4">
      ${stat("Active job cards", "18", "6 mobile, 12 shop")}
      ${stat("Ready to invoice", "5", "Labor, parts, and fees captured")}
      ${stat("Pending invoices", "$9.4k", "14 unpaid")}
      ${stat("AI recommendations", "4", "Route, invoice, DTC, follow-up")}
    </div>
    ${panel("Integrated Job Workflow", "One operating flow from booking to paid invoice", workflow(["Lead / Booking", "Job Card", "Inspection", "Approval", "Repair Order", "Parts + Labor", "Invoice", "Paid / Follow-up"]))}
    <div class="split">
      ${panel("Job Card Command Center", "Mobile, branch, bay, and fleet work in one queue", table(
        ["Job", "Customer / Vehicle", "Channel", "Location", "Status", "Invoice"],
        jobCards.map((job) => [job.id, `${job.customer}<div class="meta">${job.vehicle}</div>`, badge(job.channel), job.location, badge(job.status), job.invoice ? badge(job.invoice) : badge("Not created")])
      ))}
      ${panel("Operational Alerts", "Actionable items for advisors, mobile techs, and managers", `
        <div class="timeline">
          <div class="timeline-item"><strong>Invoice</strong><span>JC-3108 has completed work and invoice INV-10091 is unpaid.</span></div>
          <div class="timeline-item"><strong>Mobile</strong><span>JC-3109 needs customer approval before Priya starts driveway service.</span></div>
          <div class="timeline-item"><strong>Enterprise</strong><span>Apex Logistics requires PO validation before dispatch.</span></div>
          <div class="timeline-item"><strong>Diagnostics</strong><span>JC-3110 scan report is ready to convert into an estimate.</span></div>
          <div class="timeline-item"><strong>AI</strong><span>Copilot recommends adding PO validation before sending INV-10091.</span></div>
        </div>
      `)}
    </div>
    ${panel("Today's Schedule", "Bay, route, and dispatch assignment", table(
      ["Time", "Customer", "Vehicle", "Service", "Job Card", "Bay / Route", "Status"],
      appointments.map((a) => [a[0], a[1], a[2], a[3], badge(a[4]), a[5], badge(a[6])])
    ))}`;
}

function renderAccess() {
  const user = currentUser();
  return `
    <div class="grid cols-4">
      ${stat("Signed in as", user.name, user.role)}
      ${stat("Active users", users.filter((item) => item.status === "Active").length, "Role-controlled access")}
      ${stat("Invites", users.filter((item) => item.status === "Invited").length, "Pending team setup")}
      ${stat("Session", "Active", "Mock auth session")}
    </div>
    <div class="split">
      ${panel("Login Session", "MVP login controls and role switching for testing permissions", `
        <div class="form-row">
          <div class="field"><label>Email</label><input id="login-email" value="${user.email}" /></div>
          <div class="field"><label>Password</label><input id="login-password" type="password" value="demo-password" /></div>
          <div class="field"><label>Login As</label><select id="login-user">${users.map((item) => `<option value="${item.id}" ${item.id === user.id ? "selected" : ""}>${item.name} - ${item.role}</option>`).join("")}</select></div>
          <div class="field"><label>&nbsp;</label><button id="login-button" class="btn primary">${iconSvg("userkey")} Sign In</button></div>
        </div>
        <div class="actions" style="justify-content:flex-start"><button id="reset-password" class="btn">Send Password Reset</button><button id="logout-button" class="btn">End Session</button></div>
      `)}
      ${panel("Invite User", "Add staff to a shop account with a controlled role", `
        <div class="form-row">
          <div class="field"><label>Name</label><input id="invite-name" value="New Technician" /></div>
          <div class="field"><label>Email</label><input id="invite-email" value="newtech@redline.example" /></div>
          <div class="field"><label>Role</label><select id="invite-role"><option>Technician</option><option>Service Advisor</option><option>Parts Manager</option><option>Accountant</option><option>Read-only Staff</option><option>Admin</option></select></div>
          <div class="field"><label>&nbsp;</label><button id="invite-user" class="btn primary">Invite User</button></div>
        </div>
      `)}
    </div>
    ${panel("Users and Permissions", "Role-based access control for MVP", table(
      ["User", "Email", "Role", "Status", "Last Login", "Actions"],
      users.map((item) => [`<strong>${item.name}</strong>`, item.email, badge(item.role), badge(item.status), item.lastLogin, `<div class="row-actions"><button class="mini-btn" data-role-owner="${item.id}">Owner</button><button class="mini-btn" data-role-tech="${item.id}">Tech</button><button class="mini-btn" data-deactivate-user="${item.id}">Deactivate</button></div>`])
    ))}
    ${panel("Audit Trail", "Security and workflow events", table(
      ["Action", "User", "Entity", "Time"],
      auditLogs.map((log) => [log.action, log.user, log.entity, log.time])
    ))}`;
}

function renderSubscriptions() {
  return `
    <div class="grid cols-4">
      ${Object.entries(planCatalog).map(([name, plan]) => stat(name, plan.price, name === state.currentPlan ? "Current plan" : plan.features[0])).join("")}
    </div>
    <div class="split">
      ${panel("Plan Controls", "Switch plans to test free restrictions and paid subscriber access", `
        <div class="form-row">
          <div class="field"><label>Current Plan</label><select id="plan-select">${Object.keys(planCatalog).map((name) => `<option ${name === state.currentPlan ? "selected" : ""}>${name}</option>`).join("")}</select></div>
          <div class="field"><label>Billing Status</label><select><option>trialing</option><option>free</option><option>active</option><option>past_due</option><option>canceled</option></select></div>
          <div class="field"><label>Stripe Customer</label><input value="cus_demo_redline" /></div>
          <div class="field"><label>&nbsp;</label><button id="apply-plan" class="btn primary">Apply Plan</button></div>
        </div>
      `)}
      ${panel("Feature Gates", "Free users are restricted; paid subscribers unlock modules and integrations", table(
        ["Feature", "Free", "Starter", "Pro", "Enterprise"],
        [
          ["AI assistant", "Locked", "Basic", "Included", "Advanced"],
          ["Digital inspections", "Locked", "Included", "Included", "Included"],
          ["Parts inventory", "Locked", "Limited", "Included", "Multi-location"],
          ["Payments", "Manual only", "Manual", "Stripe-ready", "Advanced billing"],
          ["Multi-location", "Locked", "Locked", "3 locations", "Unlimited"],
          ["VIN/DTC integrations", "Mock only", "Mock", "Provider-ready", "API + OEM-ready"]
        ].map((row) => row.map((cell, index) => index === 0 ? cell : badge(cell)))
      ))}
    </div>
    ${panel("Usage and Limits", "Enforced by plan_features and subscriptions tables", table(
      ["Limit", "Usage", "Meter", "Status"],
      usageRows()
    ))}`;
}

function renderAi() {
  return `
    <div class="grid cols-4">
      ${stat("Estimate drafts", "7", "Generated from job cards")}
      ${stat("Invoice checks", "12", "Missing PO, tax, labor, or fee flags")}
      ${stat("DTC summaries", "3", "Technician notes converted to customer language")}
      ${stat("Route suggestions", "5", "Mobile jobs sequenced by ETA and parts")}
    </div>
    ${panel("AI Command Center", "Practical artificial intelligence features built around the automotive workflow", table(
      ["AI Feature", "Where It Works", "Business Value"],
      [
        ["Smart job triage", "Dashboard, appointments, job cards", "Ranks jobs by approval, parts availability, SLA, location, and technician skill"],
        ["Estimate writer", "Job cards and repair orders", "Drafts labor, parts, complaint/cause/correction, and customer-facing recommendations"],
        ["Invoice audit", "Invoices", "Checks missing PO numbers, discounts, tax, shop supplies, mobile call fees, and fleet terms"],
        ["Diagnostic explainer", "DTC lookup and scan tool", "Turns DTCs and freeze-frame data into technician steps and plain customer summaries"],
        ["Customer follow-up", "CRM", "Drafts SMS/email reminders for approvals, unpaid invoices, declined work, and service intervals"],
        ["Inventory forecasting", "Parts", "Predicts reorder needs from scheduled jobs, fleet PM plans, and common DTC patterns"]
      ]
    ))}
    <div class="split">
      ${panel("Live AI Recommendations", "Operational suggestions based on the mock CRM data", table(
        ["Area", "Recommendation", "Impact"],
        aiInsights.map((item) => [badge(item.area), item.recommendation, item.impact])
      ))}
      ${panel("AI Draft Preview", "Example output the advisor can edit before sending", `
        <div class="empty-note">
          Hi Maya, your 60k mobile service estimate is ready. The service includes synthetic oil, cabin filter, inspection, tire rotation, and mobile service call. Total is ready for approval, and Priya can arrive during Mobile Route 1 today.
        </div>
        <div class="actions" style="justify-content:flex-start;margin-top:12px">
          <button id="send-ai-draft" class="btn primary">${iconSvg("send")} Send Draft</button>
          <button id="attach-ai-note" class="btn">${iconSvg("clipboard")} Attach to Job Card</button>
        </div>
      `)}
    </div>
    ${panel("AI Governance", "Controls needed for a serious SaaS product", table(
      ["Control", "Purpose"],
      [["Human approval required", "AI drafts messages, estimates, and invoice notes but staff approve before sending"], ["Audit trail", "Record who accepted, edited, or rejected each AI suggestion"], ["Shop knowledge base", "Use labor guides, canned jobs, warranty rules, fleet contracts, and internal SOPs"], ["Privacy boundaries", "Do not send VIN, customer, payment, or diagnostic data to external AI providers without consent and configuration"]]
    ))}`;
}

function renderCustomers() {
  return panel("Customer Accounts", "Retail, mobile, fleet, dealer, wholesale, and enterprise relationships", table(
    ["Customer", "Type", "Contact", "Tags", "Follow-up", "Action"],
    customers.map((c) => [`<strong>${c.name}</strong><div class="meta">${c.id} - ${c.address}</div>`, badge(c.type), `${c.phone}<div class="meta">${c.email}</div>`, c.tags.map((tag) => badge(tag)).join(" "), c.followUp, `<button class="mini-btn" data-followup="${c.id}">Send follow-up</button>`])
  ));
}

function renderVehicles() {
  return `
    <div class="grid cols-3">
      ${vehicles.map((v) => `
        <article class="card vehicle-card">
          <div class="vehicle-title"><div><strong>${v.label}</strong><span class="meta">${v.trim}</span></div>${badge(v.status)}</div>
          <div class="kv">
            <div><span>VIN</span><strong>${v.vin}</strong></div>
            <div><span>Mileage</span><strong>${v.mileage}</strong></div>
            <div><span>Engine</span><strong>${v.engine}</strong></div>
            <div><span>Plate</span><strong>${v.plate}</strong></div>
          </div>
          <div class="empty-note">Recommended service: ${v.recommendation}</div>
        </article>
      `).join("")}
    </div>
    ${panel("Vehicle Service History", "Ownership, job cards, repair orders, diagnostics, and recommendations", table(
      ["Vehicle", "Transmission", "Open Work", "Diagnostic History", "Recommendation", "Action"],
      vehicles.map((v, index) => [v.label, v.transmission, badge(v.status), "2 sessions", v.recommendation, `<button class="mini-btn" data-vehicle-job="${index}">Create job</button>`])
    ))}`;
}

function renderJobCards() {
  return `
    <div class="grid cols-4">
      ${stat("Solo mobile mode", "On", "Route, driveway, payment link")}
      ${stat("Multi-shop mode", "3 branches", "Bay, tech, and parts visibility")}
      ${stat("Enterprise controls", "Enabled", "PO, SLA, fleet account")}
      ${stat("Invoice linkage", "2 synced", "Job cards feeding invoices")}
    </div>
    ${panel("Job Card Queue", "The operational record that connects booking, inspection, RO, parts, labor, diagnostics, and invoice", table(
      ["Job Card", "Customer / Vehicle", "Service", "Location", "Tech", "Workflow", "Next Action", "Actions"],
      jobCards.map((job) => [
        `<strong>${job.id}</strong><div class="meta">${job.ro} -> ${job.invoice || "Invoice pending"}</div>`,
        `${job.customer}<div class="meta">${job.vehicle}</div>`,
        `${job.serviceType}<div class="meta">${badge(job.priority)} ${badge(job.approval)}</div>`,
        `${badge(job.channel)}<div class="meta">${job.location}</div>`,
        job.technician,
        workflow(job.workflow),
        job.nextAction,
        `<div class="row-actions">
          <button class="mini-btn" data-approve-job="${job.id}">Approve</button>
          <button class="mini-btn" data-convert-ro="${job.id}">Make RO</button>
          <button class="mini-btn primary" data-create-invoice="${job.id}">Invoice</button>
        </div>`
      ])
    ))}
    <div class="split">
      ${panel("Create Job Card", "Designed for mobile mechanics, advisors, dispatchers, and fleet coordinators", `
        <div class="form-row">
          <div class="field"><label>Customer</label><select id="job-customer"><option>Maya Rodriguez</option><option>Northline Fleet Services</option><option>Apex Logistics Group</option></select></div>
          <div class="field"><label>Vehicle / VIN</label><input id="job-vin" value="2T3P1RFV7MW123456" /></div>
          <div class="field"><label>Work Type</label><select id="job-work-type"><option>Mobile service</option><option>Shop repair</option><option>Fleet PM</option><option>Parts install</option><option>Diagnostic only</option></select></div>
          <div class="field"><label>Priority</label><select id="job-priority"><option>Normal</option><option>High</option><option>Roadside</option><option>Fleet SLA</option></select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Branch / Route</label><select id="job-route"><option>Mobile Route 1</option><option>Downtown Branch</option><option>North Branch</option><option>Enterprise Depot</option></select></div>
          <div class="field"><label>Location</label><input id="job-location" value="Customer driveway - 84 Briar Lane" /></div>
          <div class="field"><label>Technician</label><select id="job-tech"><option>Priya Shah</option><option>Jordan Lee</option><option>Alex Kim</option></select></div>
          <div class="field"><label>PO / Approval</label><input id="job-approval" placeholder="PO number, approval code, or SMS approval" /></div>
        </div>
        <div class="actions" style="justify-content:flex-start"><button id="create-job-card" class="btn primary">${iconSvg("add")} Create Job Card</button><button id="ai-fill-job" class="btn">${iconSvg("ai")} AI Fill</button></div>
      `)}
      ${panel("Invoice Handoff", "Approved job cards become invoice-ready with no duplicate entry", table(
        ["Source", "Carries To Invoice"],
        [["Customer + vehicle", "Bill-to, vehicle, VIN, mileage"], ["Labor clock", "Hours and labor rate"], ["Parts picked", "SKU, quantity, retail price"], ["Diagnostics", "DTC report and scan fee"], ["Mobile / branch fee", "Service call, bay fee, or fleet SLA charge"], ["Approval", "Customer signature, PO, or account terms"]]
      ))}
    </div>`;
}

function renderScheduling() {
  return `
    <div class="grid cols-4">
      ${stat("Appointments", appointments.length, "Bay and mobile route work")}
      ${stat("Mobile routes", "2", "ETA and location aware")}
      ${stat("Checked in", appointments.filter((a) => a[6] === "Checked in").length, "Ready for advisor handoff")}
      ${stat("Reminder queue", messages.filter((m) => m.status !== "Sent").length, "SMS/email pending")}
    </div>
    ${panel("Schedule Board", "Appointments can become job cards, check-ins, reminders, and technician assignments", table(
      ["Time", "Customer", "Vehicle", "Requested Service", "Job Card", "Bay / Route", "Reminder", "Action"],
      appointments.map((a, index) => [a[0], a[1], a[2], a[3], badge(a[4]), a[5], badge(a[6]), `<div class="row-actions"><button class="mini-btn" data-checkin="${index}">Check in</button><button class="mini-btn" data-reminder="${index}">Send reminder</button></div>`])
    ))}
    ${panel("Dispatch Rules", "Useful for one mobile tech or a multi-branch company", table(
      ["Rule", "What It Does"],
      [["Mobile route order", "Prioritizes approved jobs with available parts and shortest drive time"], ["Bay assignment", "Keeps heavy repair, diagnostic, and quick service lanes separated"], ["Fleet SLA", "Flags PO-required jobs and response-time commitments"], ["No-show recovery", "Moves delayed jobs back to communication queue"]]
    ))}`;
}

function renderInspections() {
  return `
    <div class="grid cols-3">
      ${stat("Open inspections", inspections.filter((i) => i.status !== "Completed").length, "Technician checklists")}
      ${stat("Attention items", "3", "Customer-visible findings")}
      ${stat("Photos attached", "2", "Mock inspection media")}
    </div>
    ${panel("Digital Inspection Queue", "Guided checklists create findings that feed estimates and customer reports", table(
      ["Inspection", "Job Card", "Vehicle", "Technician", "Status", "Findings", "Actions"],
      inspections.map((inspection) => [
        inspection.id,
        badge(inspection.jobCard),
        inspection.vehicle,
        inspection.technician,
        badge(inspection.status),
        inspection.items.map(([name, status]) => `${name}: ${status}`).join("<br>"),
        `<div class="row-actions"><button class="mini-btn" data-complete-inspection="${inspection.id}">Complete</button><button class="mini-btn primary" data-inspection-estimate="${inspection.id}">Create estimate</button></div>`
      ])
    ))}
    ${panel("Inspection Report Builder", "Customer-friendly report sections", table(
      ["Section", "Feeds Into"],
      [["Pass / Attention / Fail checklist", "Estimate line recommendations"], ["Photos and notes", "Customer approval message"], ["DTC and freeze-frame link", "Diagnostic summary"], ["Technician signature", "RO and invoice audit trail"]]
    ))}`;
}

function renderCommunication() {
  return `
    <div class="grid cols-4">
      ${stat("Drafts", messages.filter((m) => m.status === "Draft").length, "Needs staff approval")}
      ${stat("Queued", messages.filter((m) => m.status === "Queued").length, "Ready to send")}
      ${stat("Sent", messages.filter((m) => m.status === "Sent").length, "Logged in CRM")}
      ${stat("Channels", "SMS + Email", "Approval and payment links")}
    </div>
    ${panel("Customer Message Center", "Send estimate approvals, invoice links, appointment reminders, and diagnostic summaries", table(
      ["Message", "Customer", "Channel", "Subject", "Status", "Body", "Action"],
      messages.map((message) => [message.id, message.customer, badge(message.channel), message.subject, badge(message.status), message.body, `<button class="mini-btn primary" data-send-message="${message.id}">Send</button>`])
    ))}
    ${panel("Communication Templates", "Reusable shop messages", table(
      ["Template", "Use"],
      [["Estimate approval", "Send approval link from estimate or job card"], ["Invoice payment", "Send payment link and fleet terms"], ["Appointment reminder", "Confirm bay, route, ETA, or tow-in"], ["Declined work follow-up", "Remind customers about safety and maintenance recommendations"]]
    ))}`;
}

function renderEstimates() {
  return `
    <div class="grid cols-4">
      ${stat("Open estimates", estimates.length, "Draft and pending")}
      ${stat("Pending approval", estimates.filter((e) => e.status.includes("Pending")).length, "Customer action needed")}
      ${stat("Approved today", estimates.filter((e) => e.status === "Approved").length, "Ready for RO/invoice")}
      ${stat("Estimate value", money(estimates.reduce((sum, e) => sum + e.total, 0)), "Mock pipeline")}
    </div>
    ${panel("Estimate Pipeline", "Approve, decline, or convert estimates into repair orders and invoices", table(
      ["Estimate", "Job Card", "Customer / Vehicle", "Status", "Lines", "Total", "Actions"],
      estimates.map((estimate) => [
        estimate.id,
        badge(estimate.jobCard),
        `${estimate.customer}<div class="meta">${estimate.vehicle}</div>`,
        badge(estimate.status),
        estimate.lines.join("<br>"),
        money(estimate.total),
        `<div class="row-actions"><button class="mini-btn" data-approve-estimate="${estimate.id}">Approve</button><button class="mini-btn" data-decline-estimate="${estimate.id}">Decline</button><button class="mini-btn primary" data-estimate-invoice="${estimate.id}">Invoice</button></div>`
      ])
    ))}
    ${panel("Estimate Builder", "Line items from inspections, parts, labor guides, and AI suggestions", table(
      ["Input", "Creates"],
      [["Digital inspection finding", "Recommended service line"], ["Parts availability", "Parts quantity and price"], ["Labor rate", "Labor hours and subtotal"], ["AI advisor note", "Customer-facing explanation"]]
    ))}`;
}

function renderRepairOrders() {
  return `
    ${panel("Repair Order Pipeline", "Repair orders inherit customer, vehicle, diagnosis, labor, and parts from job cards", table(
      ["RO", "Job Card", "Customer / Vehicle", "Complaint", "Correction", "Tech", "Status"],
      repairOrders.map((r) => [`<strong>${r.ro}</strong><div class="meta">${money(r.total)}</div>`, badge(r.jobCard), `${r.customer}<div class="meta">${r.vehicle}</div>`, r.concern, r.correction, r.tech, `${badge(r.status)}<div style="margin-top:6px">${badge(r.approval)}</div>`])
    ))}
    ${panel("RO Conversion Rules", "A job card becomes an RO when inspection or approved work needs technician execution", table(
      ["Workflow Step", "System Action"],
      [["Inspection complete", "Create estimate lines"], ["Approval received", "Convert to repair order"], ["Parts picked", "Reserve inventory and supplier backorders"], ["Work complete", "Lock labor and parts for invoice"], ["Invoice created", "Carry RO notes and customer-facing correction"]]
    ))}`;
}

function renderInvoices() {
  const invoice = invoices.find((item) => item.number === state.selectedInvoice) || invoices[0];
  const job = findJob(invoice.jobCard) || jobCards[0];
  const totals = calculateInvoice(invoice);
  return `
    <div class="split">
      ${panel("Invoice Register", "Every invoice can trace back to its job card, RO, parts, labor, and diagnostic report", table(
        ["Invoice", "Job Card", "Customer", "Vehicle", "Status", "Total", "Actions"],
        invoices.map((inv) => [inv.number, badge(inv.jobCard), inv.customer, inv.vehicle, badge(inv.status), money(calculateInvoice(inv).total), `<div class="row-actions"><button class="mini-btn" data-view-invoice="${inv.number}">View</button><button class="mini-btn" data-send-invoice="${inv.number}">Send</button><button class="mini-btn primary" data-pay-invoice="${inv.number}">Paid</button></div>`])
      ), `<button id="mark-selected-paid" class="btn success">Mark Selected Paid</button>`)}
      ${panel("Invoice Actions", "Workflow controls for mobile mechanics and enterprise shops", `
        <div class="grid">
          <button id="send-selected-invoice" class="btn primary">Send invoice / payment link</button>
          <button id="print-invoice" class="btn">Print / Download PDF</button>
          <button id="attach-po" class="btn">Attach PO or approval</button>
          <button id="post-fleet" class="btn">Post to fleet account</button>
        </div>
      `)}
    </div>
    <section class="invoice">
      <div class="invoice-head">
        <div><h2>Redline Service Center</h2><p class="meta">Mobile and multi-branch automotive operations</p></div>
        <div><strong>${invoice.number}</strong><p class="meta">${badge(invoice.status)}</p></div>
      </div>
      <p><strong>Bill To:</strong> ${invoice.customer}<br /><strong>Vehicle:</strong> ${invoice.vehicle}<br /><strong>Source Job Card:</strong> ${invoice.jobCard} / ${job.ro}<br /><strong>Service Location:</strong> ${job.location}</p>
      ${panel("Job Card Snapshot", "Invoice source record", `
        ${workflow(job.workflow)}
        <div class="kv" style="margin-top:12px">
          <div><span>Technician</span><strong>${job.technician}</strong></div>
          <div><span>Channel</span><strong>${job.channel}</strong></div>
          <div><span>Approval</span><strong>${job.approval}</strong></div>
          <div><span>Next Action</span><strong>${job.nextAction}</strong></div>
        </div>
      `)}
      ${table(["Item", "Qty / Hours", "Rate", "Amount"], invoice.lines.map((line) => [line[0], line[1], money(line[2]), money(line[1] * line[2])]))}
      <div class="totals">
        <div class="invoice-total-row"><span>Subtotal</span><strong>${money(totals.subtotal)}</strong></div>
        <div class="invoice-total-row"><span>Discount</span><strong>-${money(totals.discount)}</strong></div>
        <div class="invoice-total-row"><span>Shop supplies</span><strong>${money(totals.shopSupplies)}</strong></div>
        <div class="invoice-total-row"><span>Tax</span><strong>${money(totals.tax)}</strong></div>
        <div class="invoice-total-row final"><span>Total</span><strong>${money(totals.total)}</strong></div>
      </div>
    </section>`;
}

function renderParts() {
  return panel("Parts Inventory and Sales", "Parts can be sold over the counter or reserved directly from a job card", table(
    ["Part", "Category", "Cost", "Retail", "On Hand", "Supplier", "Location", "Status", "Action"],
    partsInventory.map((p) => [`<strong>${p.partNumber}</strong><div class="meta">${p.brand} - ${p.description}</div>`, p.category, money(p.cost), money(p.retail), p.quantity, p.supplier, p.location, p.quantity <= p.lowStockThreshold ? badge("Low stock") : badge("Available"), `<button class="mini-btn" data-reserve-part="${p.partNumber}" ${p.quantity <= 0 ? "disabled" : ""}>Reserve</button>`])
  ));
}

function renderPayments() {
  const unpaidInvoices = invoices.filter((invoice) => invoice.status !== "Paid");
  return `
    <div class="grid cols-4">
      ${stat("Recorded payments", payments.length, "Manual MVP payments")}
      ${stat("Paid invoices", invoices.filter((invoice) => invoice.status === "Paid").length, "Closed balances")}
      ${stat("Open invoices", unpaidInvoices.length, "Awaiting payment")}
      ${stat("Payment integration", "Stripe-ready", "Future paid feature")}
    </div>
    <div class="split">
      ${panel("Record Manual Payment", "MVP supports manual payments now; Stripe can be added later", `
        <div class="form-row">
          <div class="field"><label>Invoice</label><select id="payment-invoice">${invoices.map((invoice) => `<option value="${invoice.number}">${invoice.number} - ${invoice.customer}</option>`).join("")}</select></div>
          <div class="field"><label>Amount</label><input id="payment-amount" value="250.00" /></div>
          <div class="field"><label>Method</label><select id="payment-method"><option>Cash</option><option>Manual card</option><option>Check</option><option>Bank transfer</option><option>Fleet account</option></select></div>
          <div class="field"><label>&nbsp;</label><button id="record-payment" class="btn primary">${iconSvg("payment")} Record Payment</button></div>
        </div>
      `)}
      ${panel("Payment Rules", "Free vs paid payment behavior", table(
        ["Plan", "Payment Capability"],
        [["Free", "Manual paid/unpaid tracking only"], ["Starter", "Manual payments and payment reminders"], ["Pro", "Stripe-ready payment links"], ["Enterprise", "Fleet terms, PO, ACH, deposits, and account billing"]]
      ))}
    </div>
    ${panel("Payment Register", "Payments are linked to invoices and audit logs", table(
      ["Payment", "Invoice", "Customer", "Amount", "Method", "Status", "Date"],
      payments.map((payment) => [payment.id, badge(payment.invoice), payment.customer, money(payment.amount), payment.method, badge(payment.status), payment.date])
    ))}`;
}

function renderTechnicians() {
  return `
    <div class="grid cols-4">
      ${stat("Assigned tasks", technicianTasks.length, "Across job cards")}
      ${stat("In progress", technicianTasks.filter((task) => task.status === "In Progress").length, "Active work")}
      ${stat("Waiting approval", technicianTasks.filter((task) => task.status.includes("Waiting")).length, "Advisor/customer hold")}
      ${stat("Labor planned", technicianTasks.map((task) => Number(task.time.replace("h", ""))).reduce((sum, value) => sum + value, 0).toFixed(1) + "h", "Mock labor board")}
    </div>
    ${panel("Technician Work Board", "Assign, start, complete, and feed labor back into repair orders and invoices", table(
      ["Task", "Job Card", "Technician", "Work", "Status", "Time", "Actions"],
      technicianTasks.map((task) => [
        task.id,
        badge(task.jobCard),
        task.technician,
        task.task,
        badge(task.status),
        task.time,
        `<div class="row-actions"><button class="mini-btn" data-start-task="${task.id}">Start</button><button class="mini-btn primary" data-complete-task="${task.id}">Complete</button></div>`
      ])
    ))}
    ${panel("Technician Workflow Outputs", "What the technician screen updates elsewhere", table(
      ["Technician Action", "System Update"],
      [["Start task", "Job card moves into active workflow"], ["Complete task", "Labor is locked and job can invoice"], ["Save inspection", "Findings feed estimates and customer communication"], ["Save diagnostic", "DTC report attaches to job card and RO"]]
    ))}`;
}

function renderVin() {
  const result = state.vinResult;
  return panel("VIN Decoder", "Mocked response today, clean service boundary for a future VIN API", `
    <div class="form-row">
      <div class="field"><label>VIN</label><input id="vin-input" value="1FTFW1E85PFA24680" maxlength="17" /></div>
      <div class="field"><label>Decode Source</label><select><option>Mock provider</option><option>Future NHTSA / paid API</option></select></div>
      <div class="field"><label>Attach To</label><select><option>New job card</option><option>New vehicle record</option><option>Existing repair order</option></select></div>
      <div class="field"><label>&nbsp;</label><button id="decode-vin" class="btn primary">Decode VIN</button></div>
    </div>
    ${result ? `<div class="grid cols-4">${Object.entries(result).map(([key, value]) => stat(key.replace(/([A-Z])/g, " $1"), value, "VIN decode result")).join("")}</div>` : `<div class="empty-note">Enter a 17-character VIN and decode to populate the job card and vehicle profile.</div>`}
  `);
}

function renderDtc() {
  const result = state.dtcResult;
  return panel("Diagnostic Trouble Code Lookup", "DTC findings can be saved to the job card, RO, and invoice", `
    <div class="form-row">
      <div class="field"><label>DTC Code</label><input id="dtc-input" value="P0420" /></div>
      <div class="field"><label>System</label><select><option>All systems</option><option>Powertrain</option><option>Body</option><option>Chassis</option><option>Network</option></select></div>
      <div class="field"><label>Save To</label><select><option>Job card diagnostic note</option><option>Repair order note</option><option>Invoice report</option></select></div>
      <div class="field"><label>&nbsp;</label><button id="lookup-dtc" class="btn primary">Lookup Code</button></div>
    </div>
    ${result ? `
      <div class="grid cols-3">${stat("Code", result.code, result.category)}${stat("Severity", result.severity, "Advisor triage")}${stat("Recommendation", result.recommendation, "Suggested service")}</div>
      ${panel("DTC Detail", result.description, `<div class="grid cols-2"><div><h3>Common Causes</h3><ul>${result.causes.map((cause) => `<li>${cause}</li>`).join("")}</ul></div><div><h3>Inspection Steps</h3><ul>${result.steps.map((step) => `<li>${step}</li>`).join("")}</ul></div></div>`)}
    ` : `<div class="empty-note">Search codes like P0300, P0420, U0100, or B0020.</div>`}
  `);
}

function renderDiagnostics() {
  const connected = state.scanStatus === "Connected";
  const liveData = connected ? [["RPM", "742"], ["Coolant", "188 F"], ["Battery", "14.1V"], ["Intake Air", "82 F"], ["Speed", "0 mph"], ["Fuel Trim", "+2.4%"]] : [["RPM", "--"], ["Coolant", "--"], ["Battery", "--"], ["Intake Air", "--"], ["Speed", "--"], ["Fuel Trim", "--"]];
  return `
    ${panel("Scan Tool Session", "Simulated browser UI for a future OBD-II, Bluetooth, J2534, or backend diagnostic bridge", `
      <div class="actions" style="justify-content:flex-start;margin-bottom:14px">
        <button id="connect-scan" class="btn primary">Connect scan tool</button>
        <button id="read-codes" class="btn">Read trouble codes</button>
        <button id="clear-codes" class="btn">Clear codes</button>
        <button id="save-diagnostic" class="btn success">Save report to job card</button>
        ${badge(state.scanStatus)}
      </div>
      <div class="grid cols-3">${stat("Vehicle detected", connected ? "2020 BMW 330i" : "Waiting", connected ? "VIN WBA5R1C05LFH11223" : "No scan tool connected")}${stat("Protocol", connected ? "ISO 15765-4 CAN" : "--", "OBD-II")}${stat("Linked Job Card", "JC-3110", "Diagnostic report source")}</div>
    `)}
    <div class="diagnostic-grid">${liveData.map(([label, value]) => `<div class="data-card"><span>${label}</span><strong>${value}</strong></div>`).join("")}</div>
    <div class="split">
      ${panel("Trouble Codes", "Read from simulated scan tool", state.diagnosticCodes.length ? table(["Code", "Category", "Description", "Severity"], state.diagnosticCodes.map((code) => { const item = lookupDtc(code); return [item.code, item.category, item.description, badge(item.severity)]; })) : `<div class="empty-note">Connect scan tool and read codes to populate diagnostic results.</div>`)}
      ${panel("Freeze Frame Data", "Captured context for technician review", table(["Parameter", "Value"], [["Engine RPM", "2,410"], ["Vehicle speed", "47 mph"], ["Coolant temp", "191 F"], ["Calculated load", "42%"], ["Short term fuel trim", "+3.1%"]]))}
    </div>`;
}

function renderAppointments() {
  return panel("Service Schedule", "Calendar/list style schedule with mobile route, technician, bay, and job card assignment", table(
    ["Time", "Customer", "Vehicle", "Requested Service", "Job Card", "Bay / Route", "Reminder", "Action"],
    appointments.map((a, index) => [a[0], a[1], a[2], a[3], badge(a[4]), a[5], badge(a[6]), `<button class="mini-btn" data-checkin="${index}">Check in</button>`])
  ));
}

function renderReports() {
  return `
    <div class="grid cols-3">${reports.map(([label, value, note]) => stat(label, value, note)).join("")}</div>
    ${panel("Report Queue", "Reporting for solo operators, multi-branch shops, and enterprise accounts", table(
      ["Report", "Cadence", "Owner", "Next Action", "Action"],
      [["Revenue summary", "Daily", "Owner", "Review margin"], ["Mobile route profitability", "Weekly", "Dispatcher", "Optimize service calls"], ["Job card cycle time", "Weekly", "Service manager", "Reduce approval delay"], ["Fleet SLA compliance", "Monthly", "Account manager", "Send client scorecard"]].map((row) => [...row, `<button class="mini-btn" data-export-report="${row[0]}">Export</button>`])
    ))}`;
}

function renderSettings() {
  return `
    ${panel("Shop Profile and Operating Model", "Configure the same CRM for a mobile mechanic, growing shop, or enterprise company", `
      <div class="form-row">
        <div class="field"><label>Business Mode</label><select><option>Solo mobile mechanic</option><option>Single repair shop</option><option>Multi-location shop group</option><option>Enterprise fleet service company</option></select></div>
        <div class="field"><label>Tax Rate</label><input value="8.25%" /></div>
        <div class="field"><label>Labor Rate</label><input value="$145.00" /></div>
        <div class="field"><label>Invoice Prefix</label><input value="INV-" /></div>
      </div>
      <div class="form-row">
        <div class="field"><label>Job Card Prefix</label><input value="JC-" /></div>
        <div class="field"><label>Branches</label><input value="Downtown, North, Mobile Route 1" /></div>
        <div class="field"><label>Approval Rules</label><select><option>SMS approval</option><option>Signature required</option><option>PO required</option><option>Fleet account terms</option></select></div>
        <div class="field"><label>Diagnostic Bridge</label><select><option>Simulated</option><option>Backend API</option><option>J2534 Gateway</option><option>Bluetooth OBD-II</option></select></div>
      </div>
      <div class="actions" style="justify-content:flex-start"><button id="save-settings" class="btn primary">${iconSvg("settings")} Save Settings</button></div>
    `)}
    ${panel("Integration Boundaries", "Placeholder service files are included for future implementation", table(
      ["Service", "Purpose", "Current Mode"],
      [["vinDecoderService", "Decode VIN into vehicle and job card specs", "Mock"], ["dtcLookupService", "Return DTC guidance for job cards and invoices", "Mock"], ["scanToolService", "Connect/read/clear diagnostic data", "Simulated"], ["invoiceService", "Calculate invoice totals from job card lines", "Local"], ["partsInventoryService", "Reserve inventory for jobs and parts sales", "Mock"]]
    ))}`;
}

function bindModuleEvents() {
  document.querySelector("#login-button")?.addEventListener("click", () => {
    state.currentUserId = document.querySelector("#login-user")?.value || state.currentUserId;
    const user = currentUser();
    user.lastLogin = "Just now";
    audit("User login", user.email);
    notify(`${user.name} signed in as ${user.role}.`);
    renderShell();
  });

  document.querySelector("#reset-password")?.addEventListener("click", () => {
    audit("Password reset requested", currentUser().email);
    notify(`Password reset email queued for ${currentUser().email}.`);
  });

  document.querySelector("#logout-button")?.addEventListener("click", () => {
    audit("User logout", currentUser().email);
    notify(`${currentUser().name} session ended in prototype.`);
  });

  document.querySelector("#invite-user")?.addEventListener("click", () => {
    const name = document.querySelector("#invite-name")?.value || "Invited User";
    const email = document.querySelector("#invite-email")?.value || `user${users.length + 1}@redline.example`;
    const role = document.querySelector("#invite-role")?.value || "Technician";
    users.push({ id: `U-${users.length + 1}`, name, email, role, status: "Invited", lastLogin: "Never" });
    audit("User invited", email);
    notify(`${name} invited as ${role}.`);
    renderShell();
  });

  document.querySelectorAll("[data-role-owner]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = users.find((item) => item.id === button.dataset.roleOwner);
      user.role = "Owner";
      audit("Role changed", user.email);
      notify(`${user.name} role changed to Owner.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-role-tech]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = users.find((item) => item.id === button.dataset.roleTech);
      user.role = "Technician";
      audit("Role changed", user.email);
      notify(`${user.name} role changed to Technician.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-deactivate-user]").forEach((button) => {
    button.addEventListener("click", () => {
      const user = users.find((item) => item.id === button.dataset.deactivateUser);
      user.status = user.status === "Active" ? "Inactive" : "Active";
      audit("User status changed", user.email);
      notify(`${user.name} is now ${user.status}.`);
      renderShell();
    });
  });

  document.querySelector("#apply-plan")?.addEventListener("click", () => {
    state.currentPlan = document.querySelector("#plan-select")?.value || state.currentPlan;
    audit("Subscription changed", state.currentPlan);
    notify(`Plan changed to ${state.currentPlan}. Feature gates updated.`);
    renderShell();
  });

  document.querySelector("#record-payment")?.addEventListener("click", () => {
    const invoiceNumber = document.querySelector("#payment-invoice")?.value || state.selectedInvoice;
    const invoice = invoices.find((item) => item.number === invoiceNumber);
    const amount = Number(document.querySelector("#payment-amount")?.value || 0);
    const method = document.querySelector("#payment-method")?.value || "Manual";
    payments.unshift({ id: nextNumber("PAY-", payments, "id"), invoice: invoiceNumber, customer: invoice?.customer || "Customer", amount, method, status: "Recorded", date: "Today" });
    if (invoice) invoice.status = amount >= calculateInvoice(invoice).total ? "Paid" : "Partially Paid";
    audit("Payment recorded", invoiceNumber);
    notify(`${money(amount)} payment recorded for ${invoiceNumber}.`);
    renderShell();
  });

  document.querySelector("#top-new-job")?.addEventListener("click", () => {
    state.activeModule = "job-cards";
    notify("New job card form is ready.");
    renderShell();
  });

  document.querySelector("#top-create-invoice")?.addEventListener("click", () => {
    const target = jobCards.find((job) => !job.invoice) || jobCards[0];
    createInvoiceFromJob(target.id);
  });

  document.querySelector("#create-job-card")?.addEventListener("click", createJobCardFromForm);

  document.querySelector("#ai-fill-job")?.addEventListener("click", () => {
    const approval = document.querySelector("#job-approval");
    const location = document.querySelector("#job-location");
    if (approval) approval.value = "SMS-APPROVED";
    if (location) location.value = "Customer driveway - AI optimized first stop";
    notify("AI filled approval and optimized the mobile service location.");
  });

  document.querySelectorAll("[data-approve-job]").forEach((button) => {
    button.addEventListener("click", () => approveJob(button.dataset.approveJob));
  });

  document.querySelectorAll("[data-convert-ro]").forEach((button) => {
    button.addEventListener("click", () => convertJobToRo(button.dataset.convertRo));
  });

  document.querySelectorAll("[data-create-invoice]").forEach((button) => {
    button.addEventListener("click", () => createInvoiceFromJob(button.dataset.createInvoice));
  });

  document.querySelectorAll("[data-view-invoice]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedInvoice = button.dataset.viewInvoice;
      notify(`${state.selectedInvoice} loaded in invoice preview.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-send-invoice]").forEach((button) => {
    button.addEventListener("click", () => sendInvoice(button.dataset.sendInvoice));
  });

  document.querySelectorAll("[data-pay-invoice]").forEach((button) => {
    button.addEventListener("click", () => markInvoicePaid(button.dataset.payInvoice));
  });

  document.querySelector("#send-selected-invoice")?.addEventListener("click", () => sendInvoice(state.selectedInvoice));
  document.querySelector("#mark-selected-paid")?.addEventListener("click", () => markInvoicePaid(state.selectedInvoice));
  document.querySelector("#print-invoice")?.addEventListener("click", () => notify(`${state.selectedInvoice} print/download package prepared.`));
  document.querySelector("#attach-po")?.addEventListener("click", () => notify(`PO attached to ${state.selectedInvoice}.`));
  document.querySelector("#post-fleet")?.addEventListener("click", () => notify(`${state.selectedInvoice} posted to fleet account terms.`));

  document.querySelectorAll("[data-reserve-part]").forEach((button) => {
    button.addEventListener("click", () => reservePart(button.dataset.reservePart));
  });

  document.querySelectorAll("[data-followup]").forEach((button) => {
    button.addEventListener("click", () => {
      const customer = customers.find((item) => item.id === button.dataset.followup);
      customer.followUp = "Follow-up sent just now";
      notify(`Follow-up sent to ${customer.name}.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-vehicle-job]").forEach((button) => {
    button.addEventListener("click", () => {
      const vehicle = vehicles[Number(button.dataset.vehicleJob)];
      const id = nextNumber("JC-", jobCards, "id");
      jobCards.unshift({
        id,
        ro: null,
        invoice: null,
        customer: customers.find((customer) => customer.id === vehicle.customerId)?.name || "Vehicle Owner",
        vehicle: vehicle.label,
        serviceType: vehicle.recommendation,
        channel: "Shop bay",
        location: "Service advisor intake",
        technician: "Unassigned",
        status: "Booked",
        priority: "Normal",
        approval: "Pending",
        laborHours: 1,
        partsTotal: 0,
        workflow: ["Booked"],
        nextAction: "Assign technician"
      });
      vehicle.status = "Open Job";
      notify(`${id} created from ${vehicle.label}.`);
      state.activeModule = "job-cards";
      renderShell();
    });
  });

  document.querySelectorAll("[data-checkin]").forEach((button) => {
    button.addEventListener("click", () => {
      const appt = appointments[Number(button.dataset.checkin)];
      appt[6] = "Checked in";
      notify(`${appt[1]} checked in for ${appt[3]}.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-reminder]").forEach((button) => {
    button.addEventListener("click", () => {
      const appt = appointments[Number(button.dataset.reminder)];
      const id = `MSG-${messages.length + 1}`;
      messages.unshift({ id, customer: appt[1], channel: "SMS", subject: "Appointment reminder", status: "Sent", body: `Reminder sent for ${appt[3]} at ${appt[0]}.` });
      appt[6] = "Reminder sent";
      notify(`Reminder sent to ${appt[1]}.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-complete-inspection]").forEach((button) => {
    button.addEventListener("click", () => {
      const inspection = inspections.find((item) => item.id === button.dataset.completeInspection);
      inspection.status = "Completed";
      const job = findJob(inspection.jobCard);
      if (job) {
        addWorkflowStep(job, "Inspection Complete");
        job.nextAction = "Review estimate";
      }
      notify(`${inspection.id} completed and linked to ${inspection.jobCard}.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-inspection-estimate]").forEach((button) => {
    button.addEventListener("click", () => {
      const inspection = inspections.find((item) => item.id === button.dataset.inspectionEstimate);
      const job = findJob(inspection.jobCard);
      const id = nextNumber("EST-", estimates, "id");
      estimates.unshift({ id, jobCard: inspection.jobCard, customer: job?.customer || "Customer", vehicle: inspection.vehicle, status: "Draft", total: 295, lines: inspection.items.filter((item) => item[1] !== "Pass").map((item) => `${item[0]} - ${item[1]}`) });
      notify(`${id} created from ${inspection.id}.`);
      state.activeModule = "estimates";
      renderShell();
    });
  });

  document.querySelectorAll("[data-send-message]").forEach((button) => {
    button.addEventListener("click", () => {
      const message = messages.find((item) => item.id === button.dataset.sendMessage);
      message.status = "Sent";
      notify(`${message.channel} sent to ${message.customer}.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-approve-estimate]").forEach((button) => {
    button.addEventListener("click", () => {
      const estimate = estimates.find((item) => item.id === button.dataset.approveEstimate);
      estimate.status = "Approved";
      const job = findJob(estimate.jobCard);
      if (job) {
        job.approval = "Approved";
        job.status = "Approved";
        addWorkflowStep(job, "Estimate Approved");
      }
      notify(`${estimate.id} approved.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-decline-estimate]").forEach((button) => {
    button.addEventListener("click", () => {
      const estimate = estimates.find((item) => item.id === button.dataset.declineEstimate);
      estimate.status = "Declined";
      notify(`${estimate.id} declined and queued for follow-up.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-estimate-invoice]").forEach((button) => {
    button.addEventListener("click", () => {
      const estimate = estimates.find((item) => item.id === button.dataset.estimateInvoice);
      estimate.status = "Approved";
      createInvoiceFromJob(estimate.jobCard);
    });
  });

  document.querySelectorAll("[data-start-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = technicianTasks.find((item) => item.id === button.dataset.startTask);
      task.status = "In Progress";
      const job = findJob(task.jobCard);
      if (job) {
        job.status = "In Progress";
        addWorkflowStep(job, "Tech Started");
      }
      notify(`${task.id} started by ${task.technician}.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-complete-task]").forEach((button) => {
    button.addEventListener("click", () => {
      const task = technicianTasks.find((item) => item.id === button.dataset.completeTask);
      task.status = "Completed";
      const job = findJob(task.jobCard);
      if (job) {
        job.status = "Ready to Invoice";
        job.nextAction = "Create invoice";
        addWorkflowStep(job, "Work Complete");
      }
      notify(`${task.id} completed. ${task.jobCard} is ready to invoice.`);
      renderShell();
    });
  });

  document.querySelectorAll("[data-export-report]").forEach((button) => {
    button.addEventListener("click", () => notify(`${button.dataset.exportReport} report exported.`));
  });

  document.querySelector("#save-settings")?.addEventListener("click", () => notify("Settings saved for this prototype session."));

  document.querySelector("#send-ai-draft")?.addEventListener("click", () => {
    const job = findJob("JC-3109");
    job.nextAction = "Await customer response";
    addWorkflowStep(job, "AI Message Sent");
    notify("AI customer approval draft sent to Maya Rodriguez.");
    renderShell();
  });

  document.querySelector("#attach-ai-note")?.addEventListener("click", () => {
    const job = findJob("JC-3109");
    job.nextAction = "AI note attached for advisor review";
    addWorkflowStep(job, "AI Note Attached");
    notify("AI note attached to JC-3109.");
    renderShell();
  });

  document.querySelector("#decode-vin")?.addEventListener("click", () => {
    state.vinResult = decodeVin(document.querySelector("#vin-input").value);
    notify("VIN decoded and ready to attach to a vehicle or job card.");
    renderShell();
  });

  document.querySelector("#lookup-dtc")?.addEventListener("click", () => {
    state.dtcResult = lookupDtc(document.querySelector("#dtc-input").value);
    notify(`${state.dtcResult.code} lookup completed.`);
    renderShell();
  });

  document.querySelector("#connect-scan")?.addEventListener("click", () => {
    state.scanStatus = "Connecting";
    renderShell();
    setTimeout(() => {
      state.scanStatus = connectScanTool().status;
      renderShell();
    }, 550);
  });

  document.querySelector("#read-codes")?.addEventListener("click", () => {
    state.diagnosticCodes = readTroubleCodes();
    notify("Trouble codes read from simulated scan tool.");
    renderShell();
  });

  document.querySelector("#clear-codes")?.addEventListener("click", () => {
    state.diagnosticCodes = clearTroubleCodes();
    notify("Trouble codes cleared in simulated session.");
    renderShell();
  });

  document.querySelector("#save-diagnostic")?.addEventListener("click", saveDiagnosticReport);
}

renderShell();
