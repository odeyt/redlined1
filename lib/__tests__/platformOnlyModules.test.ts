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
import { canAccess, PLATFORM_MODULES } from '../planGate';

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

  it('gates on isPlatformOwner, not on role', () => {
    expect(src).toMatch(/PLATFORM_MODULES\.has\(id\)\s*\)\s*return isPlatformOwner/);
  });

  it('checks it before ALWAYS_SHOW, so no later rule can re-admit them', () => {
    expect(src.indexOf('PLATFORM_MODULES.has(id)')).toBeLessThan(src.indexOf('ALWAYS_SHOW.has(id)'));
  });

  it('shares one definition with planGate rather than keeping its own list', () => {
    expect(src).toMatch(/import \{[^}]*PLATFORM_MODULES[^}]*\} from '@\/lib\/planGate'/);
  });
});

describe('the shared definition', () => {
  it('covers the operator modules', () => {
    for (const id of PLATFORM_ONLY) expect(PLATFORM_MODULES.has(id)).toBe(true);
  });

  it('also hides AI Copilot, a developer console that shipped to customers', () => {
    // Its own subtitle: "Internal AI testing console". The AI customers were
    // sold lives in DTC Lookup and Inspections, which are untouched.
    expect(PLATFORM_MODULES.has('ai')).toBe(true);
  });

  it('infrastructure tooling is not plan-gated — a lapsed platform owner keeps the tools to diagnose that', () => {
    for (const id of PLATFORM_ONLY) {
      for (const status of ['free', 'trial', 'pro'] as const) {
        expect(canAccess(id, status)).toBe(true);
      }
    }
  });

  it('hiding AI Copilot did not exempt it from plan gating', () => {
    // Visibility and entitlement are separate axes. Adding 'ai' to the
    // visibility set must not hand the free tier a paid module, which is
    // exactly what a single combined set did.
    expect(canAccess('ai', 'free')).toBe(false);
    expect(canAccess('ai', 'pro')).toBe(true);
  });

  it('does not accidentally exempt any other customer module from plan gating', () => {
    for (const id of ['parts', 'reports', 'technicians', 'payments']) {
      expect(canAccess(id, 'free')).toBe(false);
    }
  });
});

describe('AI Copilot is hidden everywhere, not just the sidebar', () => {
  it('the dashboard tiles derive their exclusions from PLATFORM_MODULES', () => {
    const src = readFileSync(join(__dirname, '..', '..', 'features', 'dashboard', 'LegacyDashboardView.tsx'), 'utf8');
    // These sets used to name the operator modules by hand, so a module added
    // to PLATFORM_MODULES kept appearing as a tile after the sidebar hid it.
    expect(src).toMatch(/OWNER_TILE_EXCLUDE = new Set\(\['dashboard', \.\.\.PLATFORM_MODULES\]\)/);
    expect(src).toMatch(/STAFF_TILE_EXCLUDE = new Set\(\[[^\]]*\.\.\.PLATFORM_MODULES\]\)/);
  });

  it('the AI features customers were sold are untouched', () => {
    // "AI Advisor" on the plan cards means AI inside these workflows, not the
    // console. Both still call the AI service.
    const dtc = readFileSync(join(__dirname, '..', '..', 'features', 'dtc', 'DtcView.tsx'), 'utf8');
    const insp = readFileSync(join(__dirname, '..', '..', 'features', 'inspections', 'InspectionsView.tsx'), 'utf8');
    expect(dtc).toMatch(/explainDtc/);
    expect(insp).toMatch(/draftEstimateFromInspection/);
  });
});
