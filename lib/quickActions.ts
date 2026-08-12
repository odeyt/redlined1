/**
 * The six shortcuts at the top of the dashboard, and how they are customised.
 *
 * Defaults are per role — a technician opens job cards and inspections, an
 * owner opens the command centre and invoicing — but the defaults are only a
 * starting point. Shops differ, and the person who knows which six matter is
 * the one holding the phone.
 *
 * Stored per device in localStorage rather than in the database. That is a
 * deliberate trade, not an oversight: it needs no migration, it is instant on
 * a slow connection, and a technician's phone and the front-desk computer
 * genuinely want different shortcuts. The cost is that it does not follow a
 * user to a new device — if that turns out to matter, it moves to
 * dashboard_layout alongside the widget layout.
 */
import { getBlockedModules } from '@/lib/useShop';
import { navItems } from '@/lib/mock-data';
import { PLATFORM_MODULES } from '@/lib/planGate';

export const MAX_QUICK_ACTIONS = 6;

/**
 * What each role reaches for first, most-used first — the starting layout.
 *
 * Ordered by how often that role opens the module in a working day, not by
 * importance: the technician's list starts with job cards because that is the
 * screen they open every time they pick up work.
 */
export const DEFAULT_QUICK_ACTIONS: Record<string, string[]> = {
  owner:      ['command-center', 'job-cards', 'invoices', 'estimates', 'customers', 'reports'],
  manager:    ['job-cards', 'repair-orders', 'inspections', 'scheduling', 'parts', 'technicians'],
  advisor:    ['job-cards', 'customers', 'vehicles', 'estimates', 'inspections', 'appointments'],
  technician: ['job-cards', 'inspections', 'repair-orders', 'time-tracking', 'parts'],
};

const FALLBACK = ['job-cards', 'inspections'];

function storageKey(role: string): string {
  // Keyed by role: switching accounts on a shared shop tablet should not
  // inherit the previous person's shortcuts.
  return `rd1_quick_actions_${role}`;
}

/** Every module this role may open, as [id, icon, label]. */
export function availableModules(role: string): Array<[string, string, string]> {
  const blocked = new Set([...getBlockedModules(role), ...PLATFORM_MODULES, 'dashboard']);
  return navItems
    .filter(([id]) => !blocked.has(id))
    .map(([id, icon, label]) => [id, icon, label] as [string, string, string]);
}

/**
 * The saved layout, or this role's default.
 *
 * Always filtered against what the role may currently open: permissions
 * change, and a saved shortcut to a module the user has since lost access to
 * would bounce them back to the dashboard.
 */
export function loadQuickActions(role: string): string[] {
  const allowed = new Set(availableModules(role).map(([id]) => id));
  const fallback = (DEFAULT_QUICK_ACTIONS[role] ?? FALLBACK).filter(id => allowed.has(id));

  if (typeof window === 'undefined') return fallback.slice(0, MAX_QUICK_ACTIONS);

  try {
    const raw = window.localStorage.getItem(storageKey(role));
    if (!raw) return fallback.slice(0, MAX_QUICK_ACTIONS);
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return fallback.slice(0, MAX_QUICK_ACTIONS);

    const cleaned = parsed
      .filter((id): id is string => typeof id === 'string')
      .filter(id => allowed.has(id))
      .filter((id, i, arr) => arr.indexOf(id) === i)
      .slice(0, MAX_QUICK_ACTIONS);

    // An empty saved layout is a choice ("I want none of these"), but an
    // empty result after filtering usually means permissions changed — fall
    // back rather than showing a blank strip with no way to fix it.
    return cleaned.length > 0 ? cleaned : fallback.slice(0, MAX_QUICK_ACTIONS);
  } catch {
    return fallback.slice(0, MAX_QUICK_ACTIONS);
  }
}

export function saveQuickActions(role: string, ids: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      storageKey(role),
      JSON.stringify(ids.slice(0, MAX_QUICK_ACTIONS)),
    );
  } catch {
    // Private browsing or a full quota. The layout still applies for this
    // session; losing a preference is not worth interrupting the user.
  }
}

export function resetQuickActions(role: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(storageKey(role));
  } catch { /* see saveQuickActions */ }
}

/** Moves an item within the row, returning a new array. */
export function reorder(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
