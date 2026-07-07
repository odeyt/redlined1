const paths: Record<string, string> = {
  ai: '<path d="M12 3l1.4 4.2L18 8l-4.6 1.8L12 14l-1.4-4.2L6 8l4.6-.8z"></path><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"></path><path d="M5 13l.6 1.6L7 15l-1.4.4L5 17l-.6-1.6L3 15l1.4-.4z"></path>',
  userkey: '<circle cx="9" cy="8" r="4"></circle><path d="M3 21a6 6 0 0 1 12 0"></path><path d="M15 11h7"></path><path d="M19 11v3"></path>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"></path><path d="M9 12l2 2 4-5"></path>',
  dashboard: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>',
  customers: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>',
  vehicle: '<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11"></path><path d="M3 13h18v6H3z"></path><circle cx="7" cy="19" r="2"></circle><circle cx="17" cy="19" r="2"></circle>',
  clipboard: '<path d="M9 4h6l1 2h3v18H5V6h3z"></path><path d="M9 4a3 3 0 0 1 6 0"></path><path d="M8 11h8"></path><path d="M8 16h6"></path>',
  inspection: '<path d="M8 4h8l1 2h3v18H4V6h3z"></path><path d="M8 12l2 2 4-5"></path><path d="M8 18h8"></path>',
  message: '<path d="M4 5h16v12H7l-3 3z"></path><path d="M8 9h8"></path><path d="M8 13h5"></path>',
  estimate: '<path d="M5 3h14v18H5z"></path><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path><path d="M16 16h1"></path>',
  wrench: '<path d="M15 6a5 5 0 0 0 6 6L11 22l-5-5 10-10z"></path><path d="M7 17l-2 2"></path>',
  invoice: '<path d="M6 2h12v20l-3-2-3 2-3-2-3 2z"></path><path d="M9 8h6"></path><path d="M9 12h6"></path><path d="M9 16h4"></path>',
  payment: '<path d="M3 6h18v14H3z"></path><path d="M3 10h18"></path><path d="M7 15h5"></path><path d="M16 15h2"></path>',
  parts: '<path d="M12 2l9 5-9 5-9-5z"></path><path d="M3 7v10l9 5 9-5V7"></path><path d="M12 12v10"></path>',
  vin: '<path d="M4 5h16v14H4z"></path><path d="M7 9h10"></path><path d="M7 13h6"></path><path d="M16 13h1"></path>',
  warning: '<path d="M12 3l10 18H2z"></path><path d="M12 9v5"></path><path d="M12 18h.01"></path>',
  scan: '<path d="M4 7V4h3"></path><path d="M17 4h3v3"></path><path d="M20 17v3h-3"></path><path d="M7 20H4v-3"></path><path d="M7 12h10"></path><path d="M9 9h6"></path><path d="M9 15h6"></path>',
  calendar: '<path d="M4 5h16v17H4z"></path><path d="M8 2v5"></path><path d="M16 2v5"></path><path d="M4 10h16"></path>',
  technician: '<circle cx="12" cy="7" r="4"></circle><path d="M5 22a7 7 0 0 1 14 0"></path><path d="M9 14l3 3 3-3"></path>',
  chart: '<path d="M4 19V5"></path><path d="M4 19h18"></path><path d="M8 16v-5"></path><path d="M13 16V8"></path><path d="M18 16v-9"></path>',
  settings: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a8 8 0 0 0 .1-2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L15 5h-4l-.4 3a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.5a8 8 0 0 0 .1 2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 1.7 1l.4 3h4l.4-3a7 7 0 0 0 1.7-1l2.4 1 2-3.5z"></path>',
  clock: '<circle cx="12" cy="12" r="9"></circle><path d="M12 7v5l3 3"></path>',
  add:      '<path d="M12 5v14"></path><path d="M5 12h14"></path>',
  send:     '<path d="M22 2L11 13"></path><path d="M22 2l-7 20-4-9-9-4z"></path>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>',
  flask:    '<path d="M9 3h6v10l4 8H5l4-8z"></path><path d="M9 3V2h6v1"></path><path d="M6 16h12"></path>',
};

export const iconColors: Record<string, string> = {
  dashboard: '#39a0ed',
  access: '#22c55e',
  subscriptions: '#a855f7',
  ai: '#9b5de5',
  customers: '#2fbf71',
  vehicles: '#f59e0b',
  'job-cards': '#14b8a6',
  'time-tracking': '#f59e0b',
  scheduling: '#ec4899',
  inspections: '#10b981',
  communication: '#0ea5e9',
  estimates: '#eab308',
  'repair-orders': '#ef4444',
  invoices: '#22c55e',
  payments: '#16a34a',
  parts: '#8b5cf6',
  technicians: '#f43f5e',
  vin: '#06b6d4',
  dtc: '#f97316',
  diagnostics: '#3b82f6',
  appointments: '#ec4899',
  reports: '#64748b',
  settings: '#94a3b8',
  'repair-intelligence': '#4caf50',
  'system-health':      '#22d3ee',
  'testing-dashboard':  '#a78bfa',
};

interface IconProps {
  name: string;
  style?: React.CSSProperties;
  className?: string;
}

export function Icon({ name, style, className = 'ui-icon' }: IconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={style}
      dangerouslySetInnerHTML={{ __html: paths[name] || paths.dashboard }}
    />
  );
}
