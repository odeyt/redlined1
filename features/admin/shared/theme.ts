/**
 * features/admin/shared/theme.ts
 * Shared color tokens for the owner-admin portal, matching the palette
 * already established in features/admin/billing-health/BillingHealthDashboard.tsx.
 * No Tailwind in this app's admin surface — inline styles against these tokens.
 */
export const C = {
  bg:      '#0a0a0b',
  surface: '#111114',
  card:    '#18181c',
  border:  '#2a2a30',
  text:    '#e8e8ec',
  muted:   '#8a8a94',
  accent:  '#cc0000',
  success: '#16a34a',
  warning: '#d97706',
  danger:  '#dc2626',
  info:    '#2563eb',
};

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) + ' UTC';
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short',
  });
}
