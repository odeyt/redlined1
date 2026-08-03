/**
 * Operator tooling must not appear in customer sidebars.
 *
 * "Owner" in the sidebar means the owner of a SHOP. System Health, Disaster
 * Recovery and the Testing Dashboard belong to the owner of the PLATFORM — the
 * person running the SaaS. Every shop owner, including trial and subscribed
 * customers, saw all three.
 *
 * Nothing leaked: the APIs behind them refuse non-platform callers, which is
 * why the Testing Dashboard rendered a bare "FORBIDDEN". But a customer was
 * shown internal tools that could only fail, whose names disclose more about
 * our internals than a customer should be told.
 *
 * The server side remains the enforcement boundary. This is about what we
 * advertise.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { navItems } from '../mock-data';

const PLATFORM_ONLY = ['system-health', 'disaster-recovery', 'testing-dashboard'];

/** Mirrors the visibleNav filter in components/Sidebar.tsx. */
function visibleTo(opts: { isPlatformOwner: boolean; role: string }): string[] {
  const platformOnly = new Set(PLATFORM_ONLY);
  return navItems
    .map(([id]) => id)
    .filter(id => (platformOnly.has(id) ? opts.isPlatformOwner : true));
}

describe('platform-only modules', () => {
  it('are hidden from a shop owner', () => {
    const visible = visibleTo({ isPlatformOwner: false, role: 'owner' });
    for (const id of PLATFORM_ONLY) expect(visible).not.toContain(id);
  });

  it.each(['manager', 'advisor', 'technician'])('are hidden from a %s', role => {
    const visible = visibleTo({ isPlatformOwner: false, role });
    for (const id of PLATFORM_ONLY) expect(visible).not.toContain(id);
  });

  it('remain visible to the platform owner, who needs them', () => {
    const visible = visibleTo({ isPlatformOwner: true, role: 'owner' });
    for (const id of PLATFORM_ONLY) expect(visible).toContain(id);
  });

  it('does not hide anything a customer legitimately uses', () => {
    const visible = visibleTo({ isPlatformOwner: false, role: 'owner' });
    for (const id of ['dashboard', 'customers', 'vehicles', 'invoices', 'billing', 'subscriptions', 'settings']) {
      expect(visible).toContain(id);
    }
  });
});

describe('the sidebar source enforces this', () => {
  const src = readFileSync(join(__dirname, '..', '..', 'components', 'Sidebar.tsx'), 'utf8');

  it('gates the platform-only set on isPlatformOwner, not on role', () => {
    expect(src).toMatch(/PLATFORM_ONLY\.has\(id\)\s*\)\s*return isPlatformOwner/);
  });

  it('checks it before ALWAYS_SHOW, so no later rule can re-admit them', () => {
    expect(src.indexOf('PLATFORM_ONLY.has(id)')).toBeLessThan(src.indexOf('ALWAYS_SHOW.has(id)'));
  });

  it('covers exactly the three operator modules', () => {
    const declared = src.match(/const PLATFORM_ONLY = new Set\(\[([^\]]+)\]\)/);
    expect(declared).not.toBeNull();
    for (const id of PLATFORM_ONLY) expect(declared![1]).toContain(id);
  });
});
