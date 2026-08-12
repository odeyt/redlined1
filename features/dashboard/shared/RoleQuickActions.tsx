'use client';

/**
 * The first thing on the dashboard: the handful of things this role actually
 * does, as large tap targets.
 *
 * Reported from a phone — after signing in, the dashboard was a tall black
 * expanse and you had to scroll to reach anything usable. The widgets below
 * load asynchronously (seven parallel fetches), so on a slow connection the
 * top of the screen is empty for seconds. This section renders instantly from
 * local data, so the landing screen is useful before any request completes.
 *
 * Deliberately short. A technician wants job cards and inspections, not a
 * scrollable index of twenty modules — the sidebar already is that index.
 * Six is the cap: two rows of three on a phone, one row on a desktop.
 */
import { useShop, getBlockedModules } from '@/lib/useShop';
import { useAppDispatch } from '@/lib/store';
import { navItems } from '@/lib/mock-data';
import { Icon, iconColors } from '@/components/Icon';

/**
 * What each role reaches for first, most-used first.
 *
 * These are ordered by frequency of use in a working day, not by importance:
 * the technician's list starts with job cards because that is the screen they
 * open every time they pick up work.
 *
 * Anything blocked for the role is filtered out below rather than being
 * curated here, so tightening a role's permissions cannot leave a tile that
 * bounces the user back to the dashboard.
 */
const TOP_BY_ROLE: Record<string, string[]> = {
  owner:      ['command-center', 'job-cards', 'invoices', 'estimates', 'customers', 'reports'],
  manager:    ['job-cards', 'repair-orders', 'inspections', 'scheduling', 'parts', 'technicians'],
  advisor:    ['job-cards', 'customers', 'vehicles', 'estimates', 'inspections', 'appointments'],
  technician: ['job-cards', 'inspections', 'repair-orders', 'time-tracking', 'parts'],
};

const FALLBACK = ['job-cards', 'inspections'];

export function RoleQuickActions() {
  const { role, loading } = useShop();
  const dispatch = useAppDispatch();

  // Nothing until the role is known. Guessing would show a technician the
  // owner's tiles for a moment, and a wrong tile is worse than a late one.
  if (loading || !role) return null;

  const blocked = new Set(getBlockedModules(role));
  const meta = new Map(navItems.map(([id, icon, label]) => [id, { icon, label }]));

  const ids = (TOP_BY_ROLE[role] ?? FALLBACK)
    .filter(id => !blocked.has(id))
    .filter(id => meta.has(id))
    .slice(0, 6);

  if (ids.length === 0) return null;

  return (
    <section
      aria-label="Quick actions"
      style={{
        display: 'grid',
        // Fills the row on a phone at three across, and stays three across on
        // a desktop rather than stretching into six thin strips.
        gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))',
        gap: 10,
        marginBottom: 18,
      }}
    >
      {ids.map(id => {
        const { icon, label } = meta.get(id)!;
        const color = iconColors[id] || '#9eb2c2';
        return (
          <button
            key={id}
            type="button"
            onClick={() => dispatch({ type: 'SET_MODULE', module: id })}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              // Comfortably above the 44px minimum: this is tapped with a
              // gloved or greasy hand in a workshop.
              minHeight: 88,
              padding: '14px 8px',
              borderRadius: 14,
              border: '1px solid var(--line, rgba(255,255,255,0.10))',
              background: 'var(--card, rgba(255,255,255,0.04))',
              color: 'var(--text)',
              cursor: 'pointer',
              textAlign: 'center',
            }}
          >
            <Icon name={icon} style={{ color }} />
            <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{label}</span>
          </button>
        );
      })}
    </section>
  );
}
