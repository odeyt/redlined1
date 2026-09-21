/**
 * features/admin/shared/AdminHeader.tsx
 * Shared header + cross-links for the owner-admin portal pages
 * (/admin, /admin/accounts, /admin/support, /admin/billing-health).
 * A plain Server Component — pure navigation. The only client piece is the
 * Sign out button (AdminSignOutButton), rendered as its own client island.
 * Purely presentational — every page still runs its own server-side guard.
 */
import Link from 'next/link';
import { C } from './theme';
import { AdminSignOutButton } from './AdminSignOutButton';

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/accounts', label: 'Accounts' },
  { href: '/admin/support', label: 'Support & Issues' },
  { href: '/admin/billing-health', label: 'Billing Health' },
];

export function AdminHeader({ title, active }: { title: string; active: string }) {
  return (
    <div style={{
      background: C.surface, borderBottom: `1px solid ${C.border}`, padding: '16px 32px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 11, letterSpacing: '0.1em', color: C.accent, fontWeight: 700, textTransform: 'uppercase', marginBottom: 2 }}>
          Internal Admin — Platform Owner Only
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>{title}</h1>
      </div>
      <nav style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {NAV_ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 12, textDecoration: 'none',
              border: `1px solid ${active === item.href ? C.accent : C.border}`,
              background: active === item.href ? C.accent + '22' : 'transparent',
              color: active === item.href ? C.accent : C.muted,
            }}
          >
            {item.label}
          </Link>
        ))}
        <AdminSignOutButton />
      </nav>
    </div>
  );
}
