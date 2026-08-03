/**
 * Modules whose tables do not exist must not be reachable.
 *
 * An audit on 2026-08-03 found 28 tables referenced in code but absent from the
 * database. Diagnostics is the module that cannot survive it: all thirteen
 * tables it reads are missing, so the page fails on first use. It is sold on
 * the Professional and Business plans, and had gone unnoticed only because no
 * shop has ever held a paid plan.
 *
 * Availability is a third axis, independent of plan and role: not "has this
 * shop paid" or "is this person allowed", but "does it work at all". It is
 * therefore checked everywhere a module can be entered — the sidebar, the
 * dashboard tiles, and AppShell — because hiding one entrance leaves the
 * others open.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { UNAVAILABLE_MODULES, isModuleAvailable } from '../moduleAvailability';
import { canAccess } from '../planGate';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('what is withheld', () => {
  it('diagnostics is unavailable — every table it reads is missing', () => {
    expect(isModuleAvailable('diagnostics')).toBe(false);
  });

  it('ai remains available: its missing table is written, never read', () => {
    // ai_usage_logs is insert-only, so the feature works. The loss is usage
    // metering, which is a cost problem rather than a broken module.
    expect(isModuleAvailable('ai')).toBe(true);
  });

  it('repair-intelligence remains available: its repair_case_* tables exist', () => {
    expect(isModuleAvailable('repair-intelligence')).toBe(true);
  });

  it.each(['dashboard', 'customers', 'vehicles', 'job-cards', 'invoices', 'estimates', 'inspections', 'parts'])(
    'core module %s is unaffected', id => {
      expect(isModuleAvailable(id)).toBe(true);
    });

  it('withholds as little as possible', () => {
    expect(UNAVAILABLE_MODULES.size).toBe(1);
  });
});

describe('availability is independent of plan', () => {
  it('a paying customer is still not shown a module that cannot work', () => {
    // canAccess says yes on a paid plan; availability must still say no.
    expect(canAccess('diagnostics', 'pro')).toBe(true);
    expect(isModuleAvailable('diagnostics')).toBe(false);
  });
});

describe('every entrance is closed, not just the sidebar', () => {
  it('the sidebar filters on it', () => {
    expect(read('components/Sidebar.tsx')).toMatch(/isModuleAvailable\(id\)/);
  });

  it('the dashboard tiles filter on it', () => {
    expect(read('features/dashboard/LegacyDashboardView.tsx')).toMatch(/isModuleAvailable\(id\)/);
  });

  it('AppShell blocks it, so a dispatched SET_MODULE cannot reach the view', () => {
    const src = read('components/AppShell.tsx');
    expect(src).toMatch(/isModuleAvailable\(m\)/);
    expect(src).toMatch(/\.\.\.unavailable/);
  });
});
